import collectionNames from "../../shared/collectionNames.js";
import {
  computeAllowed,
  collapseLink,
  hasAnyVerb,
} from "../../shared/render/resolveActionAccess.js";
import { makeWorkflowOrderComparator } from "../../shared/render/compareActionOrder.js";

/**
 * GetEventsTimeline — cross-stream events timeline method (Part 46 task 6).
 *
 * Reads events referenced to a target (by reference_field / reference_value),
 * joins their linked actions in ONE aggregation (same DB; no dispatch round-trip),
 * enriches each action card with access-aware verb/link policy, and returns
 * events with their attached action cards in the same overall shape that the
 * get-events request produces today (so EventsTimeline renders unchanged).
 *
 * Cross-stream behaviour:
 *   - workflow_id set   → full workflow enrichment: computeAllowed access gate
 *     (drop if no verb held) + collapseLink for the resolved action link.
 *   - workflow_id null  → pass through status + <app_name>.message only;
 *     no access/link logic (safety valve for future task-kind docs).
 *
 * Card-worthiness and latest-event-per-action dedup faithfully port the YAML
 * behaviour of timeline_action_lookup.yaml. Card order within an event is
 * declaration order, computed in JS (see compareActionOrder.js).
 *
 * Params: { reference_field, reference_value }
 *
 * Response: array of event docs with { actions[], title, description, info }
 *   Each event.action card: { _id, kind, status, link, message, updated }
 */
async function GetEventsTimeline(context) {
  const { params, mongoDb, connection } = context;
  const { reference_field, reference_value } = params;
  const app_name = connection.app_name;
  const userRoles = context.user?.roles;
  const collections = collectionNames(connection);

  // ── Step 1: Events $match + actions $lookup in ONE aggregation ──
  //
  // Mirrors the pipeline in events-timeline.yaml:
  //   1. $match events by reference_field / reference_value, AND the event has
  //      a display block for this app (app_name field not null).
  //   2. $lookup actions joined on action_ids → _id.
  //   3. $unwind + $setWindowFields to find the last event per action.
  //   4. $group to reattach each action only to its latest referencing event.
  //   5. $replaceRoot + remove last_event_id scratch field.
  //   6. Sort events by date descending.
  //
  // Card-worthiness filter and status scalar rewrite happen in the $lookup
  // sub-pipeline, matching timeline_action_lookup.yaml verbatim.
  // visible_verbs / resolve_action_link are NOT run in the aggregation pipeline
  // because they rely on the per-request session user — they are applied in JS
  // post-processing below.

  const pipeline = [
    // ── Match events to the target reference ──
    {
      $match: {
        $and: [
          { [reference_field]: reference_value },
          // Events that have a display block for this app (mirrors the
          // display_key $ne null guard from events-timeline.yaml).
          { [app_name]: { $ne: null } },
        ],
      },
    },

    // ── Lookup actions, apply card-worthiness filter, rewrite status scalar ──
    // This is a verbatim port of the $lookup in timeline_action_lookup.yaml.
    {
      $lookup: {
        from: collections.actions,
        localField: "action_ids",
        foreignField: "_id",
        as: "actions",
        pipeline: [
          // Card-worthiness filter (from timeline_action_lookup.yaml):
          //   1. Current stage must not be 'blocked'.
          //   2. At least one stage in history must be neither 'blocked' nor
          //      'not-required' (i.e. the action has done real work).
          {
            $match: {
              $expr: {
                $and: [
                  {
                    $ne: [{ $arrayElemAt: ["$status.stage", 0] }, "blocked"],
                  },
                  {
                    $gt: [
                      {
                        $size: {
                          $filter: {
                            input: "$status.stage",
                            cond: {
                              $not: {
                                $in: ["$$this", ["blocked", "not-required"]],
                              },
                            },
                          },
                        },
                      },
                      0,
                    ],
                  },
                ],
              },
            },
          },
          // Rewrite status array → scalar current stage (must run before any
          // stage that reads status as a scalar).
          {
            $addFields: {
              status: { $arrayElemAt: ["$status.stage", 0] },
            },
          },
          // Project only the fields needed for dedup/sort/enrichment.
          // Keep all raw action fields so JS post-processing can read access,
          // app-slug links, workflow_id, kind, etc.
        ],
      },
    },

    // ── Dedup: attach each action only to its LATEST referencing event ──
    // Verbatim port of the $unwind / $setWindowFields / $group / $addFields
    // sequence from timeline_action_lookup.yaml.

    {
      $unwind: {
        path: "$actions",
        preserveNullAndEmptyArrays: true,
      },
    },

    {
      $setWindowFields: {
        partitionBy: "$actions._id",
        sortBy: { "created.timestamp": 1 },
        output: {
          last_event_id: {
            $last: "$_id",
            window: { documents: ["current", "unbounded"] },
          },
        },
      },
    },

    {
      $group: {
        _id: "$_id",
        event: { $first: "$$ROOT" },
        actions: {
          $push: {
            $cond: [{ $eq: ["$last_event_id", "$_id"] }, "$actions", null],
          },
        },
      },
    },

    // Filter nulls out of the actions array (non-latest events contribute null).
    // Action cards are ordered in JS post-processing from the denormalised
    // group_index / decl_index stamped on each action doc.
    {
      $addFields: {
        "event.actions": {
          $filter: {
            input: "$actions",
            cond: { $ne: ["$$this", null] },
          },
        },
      },
    },

    { $replaceRoot: { newRoot: "$event" } },

    // Remove the scratch field.
    { $project: { last_event_id: 0 } },

    // ── Post-lookup: drop actions whose _id equals reference_value ──
    // Mirrors the $addFields filter in events-timeline.yaml that prevents the
    // entity itself from appearing as an action card.
    {
      $addFields: {
        actions: {
          $filter: {
            input: "$actions",
            cond: { $ne: ["$$this._id", reference_value] },
          },
        },
      },
    },

    // ── Sort events newest-first ──
    { $sort: { date: -1 } },

    // ── Add display fields from the app_name display block ──
    // Mirrors the final $addFields in events-timeline.yaml.
    {
      $addFields: {
        title: `$${app_name}.title`,
        description: `$${app_name}.description`,
        info: `$${app_name}.info`,
      },
    },

    // ── Resolve the event author's avatar from the contacts collection ──
    // Events store created.user.{id,name} only; the timeline avatar wants a
    // picture src. Join the contact by _id === created.user.id and project
    // profile.picture onto created.user.picture. The EventsTimeline block
    // reads user.picture and falls back to initials when it is absent, so an
    // unmatched join (system events, deleted contacts) degrades gracefully.
    // A user IS a contact — shared collection, shared _id space.
    {
      $lookup: {
        from: collections.contacts,
        localField: "created.user.id",
        foreignField: "_id",
        as: "author_contact",
        pipeline: [{ $project: { _id: 0, picture: "$profile.picture" } }],
      },
    },
    {
      $addFields: {
        "created.user.picture": {
          $ifNull: [{ $arrayElemAt: ["$author_contact.picture", 0] }, null],
        },
      },
    },
    { $project: { author_contact: 0 } },
  ];

  const rawEvents = await mongoDb
    .collection(collections.events)
    .aggregate(pipeline)
    .toArray();

  // ── Step 2: JS post-processing — per-action card access/link enrichment ──
  //
  // visible_verbs + resolve_action_link rely on the session user's per-app
  // roles, which are not available inside a MongoDB aggregation pipeline.
  // The aggregation produces raw action docs; JS applies the access policy here.

  const compareOrder = makeWorkflowOrderComparator();

  const events = rawEvents.map((event) => {
    const rawActions = Array.isArray(event.actions) ? event.actions : [];

    // Order raw action docs by declaration order BEFORE the enrichment loop
    // trims them — the loop drops the denormalised group_index/decl_index the
    // comparator reads. The $lookup already rewrote status to a scalar stage,
    // which the comparator tolerates. Cards with missing indices sort last by _id.
    rawActions.sort(compareOrder);

    const enrichedActions = [];
    for (const action of rawActions) {
      // Workflow cards get the access gate + link collapse; non-workflow cards
      // (workflow_id null) pass through with status + message only — the
      // safety valve for future task-kind docs.
      let link = null;
      if (action.workflow_id != null) {
        const allowed = computeAllowed({
          access: action.access,
          app_name,
          userRoles,
        });
        if (!hasAnyVerb(allowed)) {
          // Drop: user holds no verb on this card.
          continue;
        }
        link = collapseLink({
          links: action[app_name]?.links ?? null,
          allowed,
        });
      }

      enrichedActions.push({
        _id: action._id,
        kind: action.kind ?? null,
        status: action.status ?? null,
        link,
        message: action[app_name]?.message ?? null,
        updated: action.updated ?? null,
      });
    }

    return {
      ...event,
      actions: enrichedActions,
    };
  });

  return events;
}

export default GetEventsTimeline;
