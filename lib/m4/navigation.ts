export const showPublicSettings = (
  status: "loading" | "authenticated" | "unauthenticated" | "unavailable",
  isPlatformAdmin: boolean,
) => status === "authenticated" && !isPlatformAdmin;
