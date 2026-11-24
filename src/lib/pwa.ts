import { useEffect, useState } from "react";
import { assetURL } from "./files";
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
export function usePWA() {
  const [online, setOnline] = useState(navigator.onLine),
    [offlineReady, setReady] = useState(false),
    [update, setUpdate] = useState<ServiceWorkerRegistration>(),
    [install, setInstall] = useState<InstallEvent>(),
    [cacheError, setCacheError] = useState("");
  useEffect(() => {
    const connection = () => setOnline(navigator.onLine),
      prompt = (e: Event) => {
        e.preventDefault();
        setInstall(e as InstallEvent);
      };
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    window.addEventListener("beforeinstallprompt", prompt);
    if ("serviceWorker" in navigator && import.meta.env.PROD) {
      navigator.serviceWorker
        .register(assetURL("sw.js"))
        .then((reg) => {
          if (reg.active) setReady(true);
          if (reg.waiting) setUpdate(reg);
          const watchInstalling = () => {
            const worker = reg.installing;
            worker?.addEventListener("statechange", () => {
              if (worker.state === "installed") {
                if (navigator.serviceWorker.controller) setUpdate(reg);
                else setReady(true);
              }
              if (worker.state === "redundant")
                setCacheError(
                  "Offline download did not finish. Check your connection and available storage, then reload.",
                );
            });
          };
          reg.addEventListener("updatefound", watchInstalling);
          watchInstalling();
          void navigator.serviceWorker.ready.then(() => setReady(true));
        })
        .catch(() =>
          setCacheError(
            "Offline installation is unavailable. Use HTTPS or localhost and allow browser storage.",
          ),
        );
    }
    return () => {
      window.removeEventListener("online", connection);
      window.removeEventListener("offline", connection);
      window.removeEventListener("beforeinstallprompt", prompt);
    };
  }, []);
  return {
    online,
    offlineReady,
    update,
    cacheError,
    canInstall: !!install,
    install: async () => {
      if (install) {
        await install.prompt();
        await install.userChoice;
        setInstall(undefined);
      }
    },
    applyUpdate: () => {
      if (update?.waiting) {
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => location.reload(),
          { once: true },
        );
        update.waiting.postMessage({ type: "SKIP_WAITING" });
      }
    },
  };
}
export async function cacheLanguage(code: string) {
  const response = await fetch(assetURL(`tessdata/${code}.traineddata.gz`));
  if (!response.ok)
    throw new Error("Language download failed. Reconnect and try again.");
  const cache = await caches.open("freescan-languages-v1");
  await cache.put(assetURL(`tessdata/${code}.traineddata.gz`), response);
}
export async function cachedLanguages() {
  if (!("caches" in window)) return [];
  const keys = await (await caches.open("freescan-languages-v1")).keys();
  return keys.map((r) => r.url.split("/").pop()!.split(".")[0]);
}
