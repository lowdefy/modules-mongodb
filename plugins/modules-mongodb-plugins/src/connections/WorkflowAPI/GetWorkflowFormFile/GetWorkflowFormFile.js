import createEngineContext from "../../shared/phases/createEngineContext.js";
import findDocs from "../../mongo/findDocs.js";
import { isSignableFormFileKey } from "../../shared/render/formFiles.js";
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
 * object whose `key` is `file_id`: a file upload value, or an image pasted
 * into a rich-text field, whose upload the Tiptap value keeps in its
 * `fileList`. The workflows `form-file` link and `download-form-file`
 * endpoints sign the key only when this finds it.
 *
 * form_data is written from the browser, so finding a key is not enough: it
 * must also be under the caller's own `{organization_id}/workflows/`, or carry
 * no module prefix at all (a form file uploaded before keys carried the
 * organization). Another organization's key, or a files module or support key
 * stored in a form slot, is never found.
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
  if (!isSignableFormFileKey(file_id, context.user?.organization_id)) {
    return null;
  }

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
