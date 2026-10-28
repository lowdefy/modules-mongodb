// Build-time check on the module's vars, run as the transformer of the top
// users lookup: top users are named from the app's own users, so turning them
// on without saying where those users live is a config mistake, not a runtime
// state.
export default function requireUsers(input, vars) {
  const users = vars.users ?? {};
  if (vars.top_users === true && (!users.collection || !users.name_field)) {
    throw new Error(
      'The service-dashboard module has top_users on but users.collection or users.name_field is not set. ' +
        'Set users: { collection, name_field } (and optionally company_field) on the module entry, or turn top_users off.',
    );
  }
  return input;
}
