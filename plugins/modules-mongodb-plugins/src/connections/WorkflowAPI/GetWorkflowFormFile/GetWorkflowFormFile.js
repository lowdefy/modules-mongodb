import createEngineContext from "../../shared/phases/createEngineContext.js";
import findDocs from "../../mongo/findDocs.js";
import {
  findFileByKey,
  pruneFormData,
  viewableActions,
} from "../../shared/render/viewableFormData.js";

/**
 * GetWorkflowFormFile — finds a file uploaded through a workflow form, by its
 * S3 key, among the form values the caller may see.
 *
 * Loads the workflow (the tenant wall applies) and its actions, keeps the
 * form_data slots of the actions the caller holds a verb on, exactly as the
 * overview requests prune them, and searches what is left at any depth for an
 * object whose `key` is `file_id`. The workflows `download-form-file` endpoint
 * signs the key only when this finds it.
 *
 * Params: { workflow_id, file_id }
 *
 * Response: the stored file object ({ key, name?, type?, ... }) or null.
 */
async function GetWorkflowFormFile(lowdefyContext) {
  const context = await createEngineContext(lowdefyContext);
  const { params, mongoDb, connection, tenant } = context;
  const { workflow_id, file_id } = params;
  const workflowsCollection = connection.workflowsCollection ?? "workflows";
  const actionsCollection = connection.actionsCollection ?? "actions";

  if (typeof file_id !== "string" || file_id === "") return null;

  const [wfDoc] = await findDocs({
    mongoDb,
    collection: workflowsCollection,
    query: { _id: workflow_id },
    tenant,
  });
  if (!wfDoc) return null;

  const rawActions = await findDocs({
    mongoDb,
    collection: actionsCollection,
    query: { workflow_id },
    tenant,
  });

  const formData = pruneFormData({
    formData: wfDoc.form_data,
    actions: viewableActions({
      actions: rawActions,
      slug: connection.slug,
      userRoles: context.user?.roles,
    }).map(({ action }) => action),
  });

  return findFileByKey(formData, file_id);
}

GetWorkflowFormFile.schema = {
  type: "object",
  required: ["workflow_id", "file_id"],
  properties: {
    workflow_id: {
      type: "string",
      description: "The workflow whose form data holds the file.",
    },
    file_id: {
      type: "string",
      description: "The file's S3 key, as stored in the form data.",
    },
  },
};
GetWorkflowFormFile.meta = {
  checkRead: false,
  checkWrite: false,
};

export default GetWorkflowFormFile;
