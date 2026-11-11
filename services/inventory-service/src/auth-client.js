export function createAuthClient({ authUrl }) {
  async function isAuthorized(authorizationHeader) {
    let res;
    try {
      res = await fetch(`${authUrl}/validate`, {
        headers: { authorization: authorizationHeader },
        signal: AbortSignal.timeout(2000),
      });
    } catch (err) {
      throw new Error(`Auth service unreachable: ${err.message}`);
    }
    if (res.status === 200) return true;
    if (res.status === 401) return false;
    throw new Error(`Unexpected response from auth service: ${res.status}`);
  }

  return { isAuthorized };
}
