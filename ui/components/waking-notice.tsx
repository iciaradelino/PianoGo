"use client";

import { LoaderCircle } from "lucide-react";
import { useSyncExternalStore } from "react";
import {
  getWakingServices,
  getWakingServicesOnServer,
  subscribeWaking,
} from "@/lib/api";
import { useSettings } from "./settings/settings-provider";

/**
 * Shown while a request is waiting for a service that is starting up after
 * being idle (scale to zero, database resuming). See serviceFetch.
 */
export function WakingNotice() {
  const { t } = useSettings();
  const services = useSyncExternalStore(
    subscribeWaking,
    getWakingServices,
    getWakingServicesOnServer,
  );
  if (services.length === 0) return null;

  const names = services.map((service) => t(`service.${service}`)).join(" + ");
  return (
    <div className="waking-notice" role="status">
      <LoaderCircle aria-hidden="true" className="waking-spinner" size={14} />
      <span>{t("service.waking", { services: names })}</span>
    </div>
  );
}
