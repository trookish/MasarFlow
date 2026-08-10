/**
 * Map raw chat failures (from /api/chat or the network) to actionable,
 * user-facing messages. Keeps the original detail but leads with what to do.
 */
export function friendlyChatError(raw: string): string {
  const msg = raw.toLowerCase();

  if (
    /401|unauthorized|invalid api key|incorrect api key|authentication/.test(
      msg,
    )
  ) {
    return `Authentication failed — check the API key in Connections. (${raw})`;
  }
  if (/403|forbidden|permission/.test(msg)) {
    return `The provider rejected access — the key may lack permissions for this model. (${raw})`;
  }
  if (/404|not found|no such model|does not exist/.test(msg)) {
    return `Model not found — pick another model for this thread. (${raw})`;
  }
  if (/429|rate limit|too many requests|quota/.test(msg)) {
    return `Rate limited — wait a moment and Retry. (${raw})`;
  }
  if (/402|insufficient|balance|credits|payment/.test(msg)) {
    return `The provider says you're out of credit — top up the account. (${raw})`;
  }
  if (/stopped responding|didn't respond|did not respond|mid-stream/.test(msg)) {
    return `The provider stopped responding — it may be overloaded; Retry usually fixes it. (${raw})`;
  }
  if (/took longer than/.test(msg)) {
    return `The request timed out — the provider or the local proxy was too slow. Retry usually fixes it. (${raw})`;
  }
  if (
    /could not reach|fetch failed|network|econnrefused|enotfound|socket|timeout|timed out/.test(
      msg,
    )
  ) {
    return `Could not reach the provider — check the base URL and your network. (${raw})`;
  }
  if (/context|too long|maximum.*tokens|token limit|window/.test(msg)) {
    return `The conversation is too long for this model's context window — start a new chat or trim the thread. (${raw})`;
  }
  if (/500|502|503|overloaded|internal/.test(msg)) {
    return `The provider is having trouble — Retry in a moment. (${raw})`;
  }
  return raw;
}
