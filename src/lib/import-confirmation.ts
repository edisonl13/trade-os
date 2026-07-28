export type PnlMode = "GROSS" | "NET" | "UNKNOWN";
export type FeeSignConvention =
  | "SIGNED"
  | "COSTS_POSITIVE"
  | "UNKNOWN";

export type ImportConfirmationError =
  | {
      code: "PNL_MODE_REQUIRED";
      message: string;
    }
  | {
      code: "FEE_CONFIRMATION_REQUIRED";
      message: string;
    };

export function getImportConfirmationError(input: {
  pnlMode: PnlMode;
  feesConfirmed: boolean;
  feeSignConvention: FeeSignConvention;
}): ImportConfirmationError | null {
  if (input.pnlMode === "UNKNOWN") {
    return {
      code: "PNL_MODE_REQUIRED",
      message:
        "Confirm whether the reported P&L is gross or net before saving.",
    };
  }

  if (
    input.pnlMode === "GROSS" &&
    (!input.feesConfirmed || input.feeSignConvention === "UNKNOWN")
  ) {
    return {
      code: "FEE_CONFIRMATION_REQUIRED",
      message:
        "Confirm the fee sign convention before saving gross P&L.",
    };
  }

  return null;
}
