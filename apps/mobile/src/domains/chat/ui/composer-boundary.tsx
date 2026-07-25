import type { ReactNode } from "react";
import { useState } from "react";

export interface ComposerRenderValue {
  readonly value: string;
  readonly onChange: (value: string) => void;
}

export function ComposerBoundary({
  children,
}: {
  readonly children: (value: ComposerRenderValue) => ReactNode;
}) {
  const [value, setValue] = useState("");
  return children({ value, onChange: setValue });
}
