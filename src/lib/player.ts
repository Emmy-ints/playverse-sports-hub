import { avatarStore, type AvatarConfig } from "./avatar";
import { guestStore } from "./guest-profile";
import { useMyProfile } from "./session";

export interface PlayerView {
  isGuest: boolean;
  loading: boolean;
  name: string;
  username: string | null;
  publicId: string | null;
  avatar: AvatarConfig | null;
  level: number;
  xp: number;
  coins: number;
}

/** One view of "who am I" for the UI: the account profile when signed in, otherwise the local guest. */
export function usePlayer(): PlayerView {
  const { profile, sessionStatus, isLoading } = useMyProfile();
  const localAvatar = avatarStore.useValue();
  const guest = guestStore.useValue();

  if (sessionStatus === "signed_in" && profile) {
    return {
      isGuest: false,
      loading: false,
      name: profile.display_name,
      username: profile.username,
      publicId: profile.public_id,
      avatar: profile.avatar_config ?? localAvatar,
      level: profile.level,
      xp: profile.xp,
      coins: profile.coins,
    };
  }
  return {
    isGuest: sessionStatus !== "signed_in",
    loading: sessionStatus === "loading" || (sessionStatus === "signed_in" && isLoading),
    name: localAvatar?.nickname ?? "Guest",
    username: null,
    publicId: null,
    avatar: localAvatar,
    level: guest.level,
    xp: guest.xp,
    coins: guest.coins,
  };
}
