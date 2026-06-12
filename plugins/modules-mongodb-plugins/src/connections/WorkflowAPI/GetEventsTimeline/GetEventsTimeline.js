import createEngineContext from '../../shared/phases/createEngineContext.js';
import { computeAllowed, collapseLink } from '../../shared/render/resolveActionAccess.js';

/**
 * GetEventsTimeline — cross-stream events timeline method (Part 46 task 6).
 *
 * Reads events referenced to a target (by reference_field / reference_value),
 * joins their linked actions in ONE aggregation (same DB; no callApi round-trip),
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
 * Card-worthiness, latest-event-per-action dedup, and sort order faithfully
 * port the YAML behaviour of timeline_action_lookup.yaml.
 *
 * Params: { reference_field, reference_value }
 *
 * Response: array of event docs with { actions[], title, description, info }
 *   Each event.action card: { _id, kind, status, link, message, sort_order, updated }
 */
async function GetEventsTimeline(lowdefyContext) {
  const context = await createEngineContext(lowdefyContext);
  const { params, mongoDb, connection } = context;
  const { reference_field, reference_value } = params;
  const app_name = connection.app_name;
  const userRoles = context.user?.roles;
  const eventsCollection = connection.eventsCollection ?? 'log-events';
  const actionsCollection = connection.actionsCollection ?? 'actions';

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
        from: actionsCollection,
        localField: 'action_ids',
        foreignField: '_id',
        as: 'actions',
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
                    $ne: [
                      { $arrayElemAt: ['$status.stage', 0] },
                      'blocked',
                    ],
                  },
                  {
                    $gt: [
                      {
                        $size: {
                          $filter: {
                            input: '$status.stage',
                            cond: {
                              $not: {
                                $in: [
                                  '$$this',
                                  ['blocked', 'not-required'],
                                ],
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
              status: { $arrayElemAt: ['$status.stage', 0] },
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
        path: '$actions',
        preserveNullAndEmptyArrays: true,
      },
    },

    {
      $setWindowFields: {
        partitionBy: '$actions._id',
        sortBy: { 'created.timestamp': 1 },
        output: {
          last_event_id: {
            $last: '$_id',
            window: { documents: ['current', 'unbounded'] },
          },
        },
      },
    },

    {
      $group: {
        _id: '$_id',
        event: { $first: '$$ROOT' },
        actions: {
          $push: {
            $cond: [
              { $eq: ['$last_event_id', '$_id'] },
              '$actions',
              null,
            ],
          },
        },
      },
    },

    // Filter nulls out of the actions array (non-latest events contribute null).
    {
      $addFields: {
        'event.actions': {
          $filter: {
            input: '$actions',
            cond: { $ne: ['$$this', null] },
          },
        },
      },
    },

    // Sort action cards within each event by sort_order asc, updated.timestamp asc.
    {
      $addFields: {
        'event.actions': {
          $sortArray: {
            input: '$event.actions',
            sortBy: { sort_order: 1, 'updated.timestamp': 1 },
          },
        },
      },
    },

    { $replaceRoot: { newRoot: '$event' } },

    // Remove the scratch field.
    { $project: { last_event_id: 0 } },

    // ── Post-lookup: drop actions whose _id equals reference_value ──
    // Mirrors the $addFields filter in events-timeline.yaml that prevents the
    // entity itself from appearing as an action card.
    {
      $addFields: {
        actions: {
          $filter: {
            input: '$actions',
            cond: { $ne: ['$$this._id', reference_value] },
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
  ];

  const rawEvents = await mongoDb
    .collection(eventsCollection)
    .aggregate(pipeline)
    .toArray();

  // ── Step 2: JS post-processing — per-action card access/link enrichment ──
  //
  // visible_verbs + resolve_action_link rely on the session user's per-app
  // roles, which are not available inside a MongoDB aggregation pipeline.
  // The aggregation produces raw action docs; JS applies the access policy here.

  const events = rawEvents.map((event) => {
    const rawActions = Array.isArray(event.actions) ? event.actions : [];

    const enrichedActions = [];
    for (const action of rawActions) {
      let card;

      if (action.workflow_id != null) {
        // ── Workflow card: apply access gate + link collapse ──
        const allowed = computeAllowed({ access: action.access, app_name, userRoles });
        if (!allowed.view && !allowed.edit && !allowed.review && !allowed.error) {
          // Drop: user holds no verb on this card.
          continue;
        }
        const links = action[app_name]?.links ?? null;
        const link = collapseLink({ links, allowed });
        const message = action[app_name]?.message ?? null;
        card = {
          _id: action._id,
          kind: action.kind ?? null,
          status: action.status ?? null,
          link,
          message,
          sort_order: action.sort_order ?? null,
          updated: action.updated ?? null,
        };
      } else {
        // ── Non-workflow card (workflow_id null): pass through ──
        // No access/link logic. Expose status + app_name.message only.
        card = {
          _id: action._id,
          kind: action.kind ?? null,
          status: action.status ?? null,
          link: null,
          message: action[app_name]?.message ?? null,
          sort_order: action.sort_order ?? null,
          updated: action.updated ?? null,
        };
      }

      enrichedActions.push(card);
    }

    return {
      ...event,
      actions: enrichedActions,
    };
  });

  return events;
}

GetEventsTimeline.schema = {};
GetEventsTimeline.meta = {
  checkRead: false,
  checkWrite: false,
};

export default GetEventsTimeline;
