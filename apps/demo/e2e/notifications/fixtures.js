// Shared seed helpers for the notifications specs.
export const COLLECTION = "notifications";

export const USER = {
  id: "e2e-inbox-user",
  sub: "e2e-inbox-user-sub",
  name: "Inbox User",
  email: "inbox@example.com",
  organization_id: "demo",
  roles: ["admin"],
  profile: { name: "Inbox User" },
};

export const OTHER_USER_ID = "e2e-inbox-other";

let minutes = 0;

// A notification record in the shape the dispatch pipeline stores.
export function record({
  _id,
  type,
  title,
  preview = null,
  read = false,
  popup = false,
  userId = USER.id,
  links = undefined,
  ageHours = undefined,
  body = undefined,
}) {
  minutes += 1;
  return {
    _id,
    type,
    title,
    preview,
    body: body ?? `<p>${title}</p>`,
    contact_id: userId,
    user_id: userId,
    read,
    popup,
    ...(links ? { links } : {}),
    created: {
      app_name: "demo",
      timestamp: new Date(
        Date.now() - (ageHours === undefined ? minutes * 60_000 : ageHours * 3_600_000),
      ),
    },
  };
}
