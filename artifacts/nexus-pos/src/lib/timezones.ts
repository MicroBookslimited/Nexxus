/**
 * Curated list of IANA timezones offered during onboarding and in Settings.
 * Weighted toward the Caribbean / Americas (our customer base) with major
 * global zones for completeness. Values are valid IANA zone ids that can be
 * passed straight to Intl.DateTimeFormat / toLocaleString.
 */
export const TIMEZONES: Array<{ value: string; label: string }> = [
  { value: "America/Jamaica", label: "Jamaica (EST, no DST)" },
  { value: "America/Port_of_Spain", label: "Trinidad & Tobago / Eastern Caribbean (AST)" },
  { value: "America/Barbados", label: "Barbados (AST)" },
  { value: "America/Guyana", label: "Guyana (GYT)" },
  { value: "America/Nassau", label: "Bahamas (Eastern)" },
  { value: "America/Grand_Turk", label: "Turks & Caicos (Eastern)" },
  { value: "America/Cayman", label: "Cayman Islands (EST, no DST)" },
  { value: "America/Santo_Domingo", label: "Dominican Republic (AST)" },
  { value: "America/Puerto_Rico", label: "Puerto Rico (AST)" },
  { value: "America/Belize", label: "Belize (CST, no DST)" },
  { value: "America/Panama", label: "Panama (EST, no DST)" },
  { value: "America/New_York", label: "US Eastern (New York)" },
  { value: "America/Chicago", label: "US Central (Chicago)" },
  { value: "America/Denver", label: "US Mountain (Denver)" },
  { value: "America/Phoenix", label: "US Arizona (no DST)" },
  { value: "America/Los_Angeles", label: "US Pacific (Los Angeles)" },
  { value: "America/Toronto", label: "Canada Eastern (Toronto)" },
  { value: "America/Vancouver", label: "Canada Pacific (Vancouver)" },
  { value: "America/Mexico_City", label: "Mexico City" },
  { value: "America/Bogota", label: "Colombia (Bogotá)" },
  { value: "America/Lima", label: "Peru (Lima)" },
  { value: "America/Sao_Paulo", label: "Brazil (São Paulo)" },
  { value: "Europe/London", label: "UK (London)" },
  { value: "Europe/Paris", label: "Central Europe (Paris/Berlin)" },
  { value: "Africa/Lagos", label: "West Africa (Lagos)" },
  { value: "Africa/Nairobi", label: "East Africa (Nairobi)" },
  { value: "Asia/Dubai", label: "Gulf (Dubai)" },
  { value: "Asia/Kolkata", label: "India (Kolkata)" },
  { value: "Asia/Singapore", label: "Singapore" },
  { value: "Asia/Hong_Kong", label: "Hong Kong" },
  { value: "Asia/Tokyo", label: "Japan (Tokyo)" },
  { value: "Australia/Sydney", label: "Australia Eastern (Sydney)" },
];

export const DEFAULT_TIMEZONE = "America/Jamaica";
