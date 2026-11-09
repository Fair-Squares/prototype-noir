/**
 * zkPassport SDK wrapper for Fair Squares KYC.
 *
 * In simulation mode, the actual zkPassport SDK is not called.
 * The KYCFlow component talks directly to API routes.
 *
 * This module exists for future integration with the real @zkpassport/sdk.
 */

export const DEV_MODE =
  process.env.NEXT_PUBLIC_DEV_MODE === "true" ||
  process.env.NEXT_PUBLIC_SIMULATION === "true";
export type KYCStatus = "pending" | "verified" | "failed";
