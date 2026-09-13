const DEFAULT_PRODUCTION_API_URL = "https://api.867678.xyz";

export const FUCKXTER_API_URL = (
  import.meta.env.PUBLIC_FUCKXTER_API_URL?.trim() || DEFAULT_PRODUCTION_API_URL
).replace(/\/+$/, "");
