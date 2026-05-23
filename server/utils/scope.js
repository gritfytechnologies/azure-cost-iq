/**
 * server/utils/scope.js
 * Shared helpers for scope extraction and validation across all route handlers.
 *
 * Valid scope formats accepted by Azure Cost Management APIs:
 *   /subscriptions/{uuid}
 *   /providers/Microsoft.Management/managementGroups/{name}
 */

const VALID_SCOPE_RE =
  /^(\/subscriptions\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\/providers\/Microsoft\.Management\/managementGroups\/[A-Za-z0-9._-]+)$/i;

export function getScope(req) {
  return req.query.scope || process.env.DEFAULT_SCOPE || null;
}

/**
 * Extracts and validates the scope from the request.
 * Sends a 400 response and returns null if the scope is missing or malformed.
 * Returns the validated scope string on success.
 */
export function requireScope(req, res) {
  const scope = getScope(req);
  if (!scope) {
    res.status(400).json({
      error: 'scope query parameter is required',
      requestId: req.id,
    });
    return null;
  }
  if (!VALID_SCOPE_RE.test(scope)) {
    res.status(400).json({
      error: 'Invalid scope format. Expected /subscriptions/{uuid} or /providers/Microsoft.Management/managementGroups/{name}',
      requestId: req.id,
    });
    return null;
  }
  return scope;
}

/**
 * Extracts the subscription ID from a scope string.
 * Used by the Advisor client which requires a subscription ID, not a full scope URI.
 * Returns undefined for management-group scopes.
 */
export function extractSubId(scope) {
  const match = (scope || '').match(/subscriptions\/([0-9a-f-]+)/i);
  return match ? match[1] : undefined;
}
