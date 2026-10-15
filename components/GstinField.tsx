"use client";

import { AlertTriangle, CheckCircle2, MapPin, XCircle } from "lucide-react";
import { GST_STATES, parseGstin, placeOfSupply } from "@/lib/gst";
import { useApi } from "@/lib/hooks";
import type { StoreSettings } from "@/lib/types";
import { Field, Input, Select, cx } from "./ui";

/**
 * GSTIN input that validates as you type and shows the place of supply
 * (state from the first two digits, IGST vs CGST + SGST against our store).
 * `onState` receives the state name whenever a GSTIN with a known state code is entered.
 */
export function GstinField({
  value,
  onChange,
  onState,
  label = "GSTIN",
  hint,
  className,
  showTaxType = true,
  required,
}: {
  value: string;
  onChange: (gstin: string) => void;
  onState?: (stateName: string) => void;
  label?: string;
  hint?: string;
  className?: string;
  /** Show IGST / CGST + SGST against the store (off for the store's own GSTIN) */
  showTaxType?: boolean;
  required?: boolean;
}) {
  const { data: store } = useApi<StoreSettings>("/settings");
  const info = parseGstin(value);
  const pos = placeOfSupply({ gstin: value }, store);

  function change(raw: string) {
    const g = raw.toUpperCase().replace(/\s/g, "").slice(0, 15);
    onChange(g);
    const parsed = parseGstin(g);
    if (parsed.stateName && onState) onState(parsed.stateName);
  }

  return (
    <Field label={label} className={className} required={required}>
      <Input
        value={value}
        required={required}
        onChange={(e) => change(e.target.value)}
        placeholder="e.g. 36AAACC2478M1ZH"
        maxLength={15}
        autoCapitalize="characters"
        spellCheck={false}
        className={cx(
          "font-mono tracking-wide",
          !info.empty && !info.valid && value.length === 15 && "border-red-400 focus:border-red-500 focus:ring-red-500/20",
          info.valid && !info.warning && "border-brand-400",
        )}
        aria-invalid={!info.empty && !info.valid && value.length === 15}
      />
      {info.empty ? (
        hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>
      ) : (
        <span className="mt-1.5 block space-y-1 text-xs">
          {info.stateName && (
            <span className="flex flex-wrap items-center gap-1.5 text-slate-600">
              <MapPin className="size-3.5 text-brand-600" />
              Place of supply:
              <b className="font-semibold text-slate-800">
                {info.stateName} ({info.stateCode})
              </b>
              {showTaxType && pos.taxType && (
                <span
                  className={cx(
                    "rounded px-1.5 py-0.5 text-[11px] font-semibold",
                    pos.interState ? "bg-amber-50 text-amber-800" : "bg-brand-50 text-brand-700",
                  )}
                  title={pos.interState ? "Different state from your store — inter-state supply" : "Same state as your store"}
                >
                  {pos.taxType}
                </span>
              )}
            </span>
          )}
          {info.error && value.length >= 2 && (value.length === 15 || !info.stateName) && (
            <span className="flex items-center gap-1.5 text-red-600">
              <XCircle className="size-3.5 shrink-0" />
              {info.error}
            </span>
          )}
          {!info.error && info.warning && (
            <span className="flex items-center gap-1.5 text-amber-700">
              <AlertTriangle className="size-3.5 shrink-0" />
              {info.warning}
            </span>
          )}
          {info.valid && !info.warning && (
            <span className="flex items-center gap-1.5 text-brand-700">
              <CheckCircle2 className="size-3.5 shrink-0" />
              Valid GSTIN · PAN {info.pan}
            </span>
          )}
          {!info.valid && !info.error?.includes("state") && value.length > 2 && value.length < 15 && (
            <span className="text-slate-400">{15 - value.length} more characters</span>
          )}
        </span>
      )}
    </Field>
  );
}

const STATE_OPTIONS = Object.entries(GST_STATES)
  .filter(([code]) => !["28", "97", "99"].includes(code))
  .map(([, name]) => name)
  .sort((a, b) => a.localeCompare(b));

/** State dropdown of GST states; shows "from GSTIN" when the GSTIN decides it */
export function StateSelect({
  value,
  onChange,
  gstin,
  label = "State",
}: {
  value: string;
  onChange: (state: string) => void;
  gstin?: string;
  label?: string;
}) {
  const fromGstin = parseGstin(gstin).stateName;
  const options = value && !STATE_OPTIONS.includes(value) ? [value, ...STATE_OPTIONS] : STATE_OPTIONS;
  return (
    <Field label={label} hint={fromGstin && fromGstin === value ? "Filled from GSTIN" : undefined}>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select state</option>
        {options.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </Select>
    </Field>
  );
}
