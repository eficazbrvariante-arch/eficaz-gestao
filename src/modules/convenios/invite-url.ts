export function inviteUrl(slug: string, rawToken: string) {
  const origin = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  return `${origin}/convenio/${slug}/${rawToken}`;
}
