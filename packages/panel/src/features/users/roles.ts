export const appRoles = ["admin", "editor", "viewer"] as const;

export type AppRole = (typeof appRoles)[number];
