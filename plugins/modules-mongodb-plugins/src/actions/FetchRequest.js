async function FetchRequest({
  methods: { request, setState },
  params: { requestName, pageSize = 2000 },
}) {
  if (!requestName) {
    throw new Error("FetchRequest requires a request name.");
  }

  let skip = 0;
  await setState({ fetch_request_pagination: { skip, pageSize } });
  let response = await request(requestName);
  let data = response[0];

  while (response[0].length === pageSize) {
    skip = skip + pageSize;
    await setState({ fetch_request_pagination: { skip, pageSize } });
    response = await request(requestName);
    data = data.concat(response[0]);
  }

  return data;
}

export default FetchRequest;
