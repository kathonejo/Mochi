"use client";

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Settings, X, Plus, Save } from "lucide-react";
import { MOCHI_NETWORK } from "@/lib/contracts";
import type {
  ArtistProfile,
  ArtistProfileChallengeResponse,
  ArtistProfileVerifyResponse,
} from "@/lib/marketplace-hub-types";
import { PROFILE_SESSION_PREFIX } from "@/components/marketplace-hub-shared";
import { useWalletSession } from "@/components/wallet-provider";

type SocialRow = { key: string; url: string };

type PublicProfileHeaderEditorProps = {
  wallet: string;
  initialProfile: ArtistProfile | null;
  fallbackName: string;
};

type EditableProfileState = {
  displayName: string;
  avatarUrl: string;
  bannerUrl: string;
  bio: string;
  socialLinks: Record<string, string>;
  commissionEnabled: boolean;
  acceptingNewClients: boolean;
};

const DEFAULT_PROFILE_AVATAR_SRC = "/placeholder-user.jpg";
const DEFAULT_PROFILE_BANNER_SRC = "/placeholder.jpg";

function normalizeWallet(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function resolveMediaUrl(raw: string | null | undefined) {
  const value = String(raw || "").trim();
  if (!value) return null;
  if (value.startsWith("ipfs://")) {
    const path = value.slice("ipfs://".length).replace(/^ipfs\//, "");
    return path ? `https://ipfs.io/ipfs/${path}` : null;
  }
  return value;
}

function createEditableState(profile: ArtistProfile | null): EditableProfileState {
  return {
    displayName: profile?.displayName || "",
    avatarUrl: profile?.avatarUrl || "",
    bannerUrl: profile?.bannerUrl || "",
    bio: profile?.bio || "",
    socialLinks: profile?.socialLinks || {},
    commissionEnabled: profile?.commissionEnabled || false,
    acceptingNewClients: profile?.acceptingNewClients ?? false,
  };
}

function socialLinksToRows(socialLinks: Record<string, string>): SocialRow[] {
  return Object.entries(socialLinks)
    .filter(([key, url]) => String(key || "").trim() && String(url || "").trim())
    .slice(0, 10)
    .map(([key, url]) => ({ key, url }));
}

function socialRowsToRecord(rows: SocialRow[]): Record<string, string> {
  return Object.fromEntries(
    rows
      .map((row) => [row.key.trim(), row.url.trim()] as const)
      .filter(([key, url]) => key && url),
  );
}

async function fileToDataUrl(file: File): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Solo imagenes."));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      reject(new Error("Maximo 5MB."));
      return;
    }
    resolve();
  });

  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

export function PublicProfileHeaderEditor({
  wallet,
  initialProfile,
  fallbackName,
}: PublicProfileHeaderEditorProps) {
  const { publicKey, signMessage } = useWalletSession();
  const normalizedWallet = normalizeWallet(wallet);
  const normalizedViewer = normalizeWallet(publicKey);
  const isOwner = Boolean(normalizedViewer && normalizedViewer === normalizedWallet);

  const [profileState, setProfileState] = useState<EditableProfileState>(() => createEditableState(initialProfile));
  const [draft, setDraft] = useState<EditableProfileState>(() => createEditableState(initialProfile));
  const [socialRows, setSocialRows] = useState<SocialRow[]>(() => socialLinksToRows(initialProfile?.socialLinks || {}));
  const [isEditing, setIsEditing] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [isSaveLoading, setIsSaveLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [bannerDragging, setBannerDragging] = useState(false);
  const [avatarDragging, setAvatarDragging] = useState(false);

  const bannerInputRef = useRef<HTMLInputElement | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const next = createEditableState(initialProfile);
    setProfileState(next);
    setDraft(next);
    setSocialRows(socialLinksToRows(initialProfile?.socialLinks || {}));
  }, [initialProfile]);

  useEffect(() => {
    if (!isOwner || !publicKey) {
      setSessionToken(null);
      return;
    }
    const stored = window.localStorage.getItem(`${PROFILE_SESSION_PREFIX}${publicKey}`);
    setSessionToken(stored || null);
  }, [isOwner, publicKey]);

  const bannerUrl = resolveMediaUrl(profileState.bannerUrl);
  const avatarUrl = resolveMediaUrl(profileState.avatarUrl);
  const draftBannerUrl = resolveMediaUrl(draft.bannerUrl);
  const draftAvatarUrl = resolveMediaUrl(draft.avatarUrl);
  const displayedBannerSrc = draftBannerUrl || DEFAULT_PROFILE_BANNER_SRC;
  const displayedAvatarSrc = draftAvatarUrl || DEFAULT_PROFILE_AVATAR_SRC;
  const displayName = profileState.displayName.trim() || fallbackName;

  async function ensureSession() {
    if (!isOwner || !publicKey) {
      throw new Error("Conecta tu wallet.");
    }
    const existing = window.localStorage.getItem(`${PROFILE_SESSION_PREFIX}${publicKey}`) || sessionToken;
    if (existing) {
      setSessionToken(existing);
      return existing;
    }

    setIsAuthLoading(true);
    try {
      const challengeResponse = await fetch("/api/artist-profiles/auth/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: publicKey }),
      });
      const challengePayload = (await challengeResponse.json()) as
        | (ArtistProfileChallengeResponse & { error?: string })
        | { error?: string };
      if (!challengeResponse.ok || !("challengeId" in challengePayload)) {
        throw new Error(challengePayload.error || "No se pudo iniciar la firma.");
      }

      let signedMessage = "";
      let signerAddress = publicKey;
      try {
        const signature = await signMessage(challengePayload.message, { address: publicKey });
        signedMessage = signature.signedMessage;
        signerAddress = signature.signerAddress || publicKey;
      } catch (error) {
        if (MOCHI_NETWORK !== "local") {
          throw error;
        }
        signedMessage = `local-dev-auth:${challengePayload.challengeId}:${Date.now()}`;
        signerAddress = publicKey;
      }

      const verifyResponse = await fetch("/api/artist-profiles/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: publicKey,
          challengeId: challengePayload.challengeId,
          signedMessage,
          signerAddress,
        }),
      });
      const verifyPayload = (await verifyResponse.json()) as
        | (ArtistProfileVerifyResponse & { error?: string })
        | { error?: string };
      if (!verifyResponse.ok || !("sessionToken" in verifyPayload)) {
        throw new Error(verifyPayload.error || "No se pudo validar la firma.");
      }

      window.localStorage.setItem(`${PROFILE_SESSION_PREFIX}${publicKey}`, verifyPayload.sessionToken);
      setSessionToken(verifyPayload.sessionToken);
      return verifyPayload.sessionToken;
    } finally {
      setIsAuthLoading(false);
    }
  }

  function startEdit() {
    setDraft(profileState);
    setSocialRows(socialLinksToRows(profileState.socialLinks));
    setMessage("");
    setIsEditing(true);
  }

  function cancelEdit() {
    setDraft(profileState);
    setSocialRows(socialLinksToRows(profileState.socialLinks));
    setMessage("");
    setIsEditing(false);
  }

  async function handleSave() {
    if (!isOwner || !publicKey) return;
    setIsSaveLoading(true);
    setMessage("");
    try {
      const token = await ensureSession();
      const payload = {
        profile: {
          displayName: draft.displayName.trim(),
          avatarUrl: draft.avatarUrl.trim(),
          bannerUrl: draft.bannerUrl.trim(),
          bio: draft.bio.trim(),
          socialLinks: socialRowsToRecord(socialRows),
        },
      };
      const response = await fetch(`/api/artist-profiles/${encodeURIComponent(normalizedWallet)}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-artist-session": token,
        },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { profile?: ArtistProfile; error?: string };
      if (!response.ok || !result.profile) {
        if (response.status === 401 && publicKey) {
          window.localStorage.removeItem(`${PROFILE_SESSION_PREFIX}${publicKey}`);
          setSessionToken(null);
        }
        throw new Error(result.error || "No se pudo guardar.");
      }
      const next = createEditableState(result.profile);
      setProfileState(next);
      setDraft(next);
      setSocialRows(socialLinksToRows(result.profile.socialLinks || {}));
      setIsEditing(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar.");
    } finally {
      setIsSaveLoading(false);
    }
  }

  async function handleImageFile(file: File, target: "banner" | "avatar") {
    setMessage("");
    try {
      const dataUrl = await fileToDataUrl(file);
      setDraft((prev) => (target === "banner" ? { ...prev, bannerUrl: dataUrl } : { ...prev, avatarUrl: dataUrl }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo cargar la imagen.");
    }
  }

  async function onBannerInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) await handleImageFile(file, "banner");
    event.target.value = "";
  }

  async function onAvatarInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) await handleImageFile(file, "avatar");
    event.target.value = "";
  }

  function onDropImage(event: DragEvent<HTMLElement>, target: "banner" | "avatar") {
    event.preventDefault();
    if (target === "banner") setBannerDragging(false);
    if (target === "avatar") setAvatarDragging(false);
    if (!isEditing) return;
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    void handleImageFile(file, target);
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-border bg-white/10 backdrop-blur-sm">
      <input ref={bannerInputRef} type="file" accept="image/*" className="hidden" onChange={onBannerInputChange} />
      <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={onAvatarInputChange} />

      <div
        className={`relative h-36 w-full border-b border-border bg-gradient-to-br from-white/10 via-white/5 to-transparent md:h-44 ${
          isEditing ? "cursor-pointer" : ""
        }`}
        onClick={() => (isEditing ? bannerInputRef.current?.click() : undefined)}
        onDragOver={(event) => {
          if (!isEditing) return;
          event.preventDefault();
          setBannerDragging(true);
        }}
        onDragLeave={() => setBannerDragging(false)}
        onDrop={(event) => onDropImage(event, "banner")}
        role={isEditing ? "button" : undefined}
        tabIndex={isEditing ? 0 : -1}
        onKeyDown={(event) => {
          if (!isEditing) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            bannerInputRef.current?.click();
          }
        }}
      >
        <img src={displayedBannerSrc} alt="" className="h-full w-full object-cover" />

        {isEditing ? (
          <div
            className={`absolute inset-0 flex items-start justify-end p-3 ${
              bannerDragging ? "bg-white/10" : "bg-black/10"
            }`}
          >
            <span className="rounded-full border border-border bg-black/40 px-2.5 py-1 text-xs text-foreground">
              Portada
            </span>
          </div>
        ) : null}
      </div>

      <div className="p-4 md:p-6">
        <div className="-mt-14 flex flex-col gap-4 md:-mt-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex min-w-0 items-end gap-4">
              <div
                className={`relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-border bg-black/30 shadow-lg md:h-24 md:w-24 ${
                  isEditing ? "cursor-pointer" : ""
                }`}
                onClick={() => (isEditing ? avatarInputRef.current?.click() : undefined)}
                onDragOver={(event) => {
                  if (!isEditing) return;
                  event.preventDefault();
                  setAvatarDragging(true);
                }}
                onDragLeave={() => setAvatarDragging(false)}
                onDrop={(event) => onDropImage(event, "avatar")}
                role={isEditing ? "button" : undefined}
                tabIndex={isEditing ? 0 : -1}
                onKeyDown={(event) => {
                  if (!isEditing) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    avatarInputRef.current?.click();
                  }
                }}
              >
                <img src={displayedAvatarSrc} alt={displayName} className="h-full w-full object-cover" />
                {isEditing ? (
                  <div
                    className={`absolute inset-0 flex items-end justify-center p-1 ${
                      avatarDragging ? "bg-white/15" : "bg-black/20"
                    }`}
                  >
                    <span className="rounded-full border border-border bg-black/40 px-2 py-0.5 text-[11px] text-foreground">
                      Foto
                    </span>
                  </div>
                ) : null}
              </div>

              <div className="min-w-0">
                {isEditing ? (
                  <input
                    value={draft.displayName}
                    onChange={(event) => setDraft((prev) => ({ ...prev, displayName: event.target.value }))}
                    placeholder={fallbackName}
                    className="w-full min-w-[220px] rounded-lg border border-border bg-white/5 px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-white/30"
                  />
                ) : (
                  <h1 className="truncate text-xl font-semibold text-foreground md:text-2xl">{displayName}</h1>
                )}
                <p className="mt-1 truncate text-xs text-muted-foreground">{normalizedWallet}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {profileState.commissionEnabled ? (
                <span className="rounded-full border border-border bg-white/5 px-2.5 py-1 text-xs text-foreground">
                  {profileState.acceptingNewClients ? "Comisiones abiertas" : "Comisiones cerradas"}
                </span>
              ) : null}

              {isOwner ? (
                <>
                  {isEditing ? (
                    <>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="inline-flex items-center justify-center rounded-md border border-border bg-white/10 p-2 text-foreground hover:bg-white/15"
                        aria-label="Cancelar edición"
                      >
                        <X className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSave()}
                        disabled={isSaveLoading || isAuthLoading}
                        className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-white/10 px-3 py-2 text-sm text-foreground hover:bg-white/15 disabled:opacity-60"
                      >
                        <Save className="h-4 w-4" />
                        Guardar
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={startEdit}
                      className="inline-flex items-center justify-center rounded-md border border-border bg-white/10 p-2 text-foreground hover:bg-white/15"
                      aria-label="Configurar perfil"
                      title="Configurar perfil"
                    >
                      <Settings className="h-4 w-4" />
                    </button>
                  )}
                </>
              ) : null}
            </div>
          </div>

          {isEditing ? (
            <textarea
              value={draft.bio}
              onChange={(event) => setDraft((prev) => ({ ...prev, bio: event.target.value }))}
              rows={3}
              placeholder="Bio"
              className="w-full rounded-xl border border-border bg-white/5 px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-white/30"
            />
          ) : profileState.bio ? (
            <p className="max-w-4xl text-sm leading-6 text-muted-foreground">{profileState.bio}</p>
          ) : null}

          {isEditing ? (
            <div className="rounded-2xl border border-border bg-white/5 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground">Redes</p>
                <button
                  type="button"
                  onClick={() => setSocialRows((prev) => (prev.length >= 10 ? prev : [...prev, { key: "", url: "" }]))}
                  className="inline-flex items-center justify-center rounded-md border border-border bg-white/5 p-1.5 text-foreground hover:bg-white/10"
                  aria-label="Agregar red"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-2">
                {socialRows.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => setSocialRows([{ key: "", url: "" }])}
                    className="w-full rounded-lg border border-dashed border-border bg-white/5 px-3 py-2 text-left text-sm text-muted-foreground hover:bg-white/10"
                  >
                    Agregar red
                  </button>
                ) : (
                  socialRows.map((row, index) => (
                    <div key={`social-row-${index}`} className="grid gap-2 sm:grid-cols-[140px_1fr_auto]">
                      <input
                        value={row.key}
                        onChange={(event) =>
                          setSocialRows((prev) =>
                            prev.map((item, i) => (i === index ? { ...item, key: event.target.value } : item)),
                          )
                        }
                        placeholder="Instagram"
                        className="rounded-lg border border-border bg-white/5 px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-white/30"
                      />
                      <input
                        value={row.url}
                        onChange={(event) =>
                          setSocialRows((prev) =>
                            prev.map((item, i) => (i === index ? { ...item, url: event.target.value } : item)),
                          )
                        }
                        placeholder="https://..."
                        className="rounded-lg border border-border bg-white/5 px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-white/30"
                      />
                      <button
                        type="button"
                        onClick={() => setSocialRows((prev) => prev.filter((_, i) => i !== index))}
                        className="inline-flex items-center justify-center rounded-lg border border-border bg-white/5 p-2 text-foreground hover:bg-white/10"
                        aria-label="Eliminar red"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : Object.keys(profileState.socialLinks).length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {Object.entries(profileState.socialLinks)
                .filter(([label, href]) => String(label || "").trim() && String(href || "").trim())
                .map(([label, href]) => (
                  <a
                    key={`${label}:${href}`}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center rounded-full border border-border bg-white/5 px-3 py-1.5 text-xs text-foreground hover:bg-white/10"
                  >
                    {label}
                  </a>
                ))}
            </div>
          ) : null}

          {message ? (
            <p className="text-xs text-muted-foreground">{message}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
