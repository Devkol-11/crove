// Server component — reads the token from the email link (?token=xxx)
// and passes it to the client form so it can POST to /api/auth/reset-password.
import ResetPasswordForm from "./ResetPasswordForm";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <ResetPasswordForm token={token ?? ""} />;
}
