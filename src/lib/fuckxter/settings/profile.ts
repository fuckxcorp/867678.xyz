import { uploadMedia, updateAvatar } from "../api";
import { getAccount, hydrateSession, updateProfile } from "../auth";
import { avatarGradient } from "../dom";
import { apiEndpoint } from "../http";
import { setStatus, type SettingsContext } from "./shared";

const GENDER_PRESETS = ["男", "女", "跨性别男", "跨性别女"];

export function mountProfileSettings(
  root: HTMLElement,
  context: SettingsContext,
): void {
  const profileForm = root.querySelector<HTMLFormElement>(
    "[data-role=profile-form]",
  )!;
  const bioInput =
    profileForm.querySelector<HTMLTextAreaElement>("[name=bio]")!;
  const bioCount = root.querySelector<HTMLElement>("[data-role=bio-count]")!;
  const profileStatus =
    profileForm.querySelector<HTMLElement>(".fk-form-status")!;
  const avatar = root.querySelector<HTMLElement>("[data-role=profile-avatar]")!;
  const avatarUpload = root.querySelector<HTMLButtonElement>(
    "[data-role=avatar-upload]",
  )!;
  const avatarRemove = root.querySelector<HTMLButtonElement>(
    "[data-role=avatar-remove]",
  )!;
  const avatarInput = root.querySelector<HTMLInputElement>(
    "[data-role=avatar-input]",
  )!;
  const genderSelect =
    profileForm.querySelector<HTMLSelectElement>("[name=gender]")!;
  const genderCustomInput = profileForm.querySelector<HTMLInputElement>(
    "[name=genderCustom]",
  )!;

  const syncGenderField = (gender: string) => {
    if (GENDER_PRESETS.includes(gender) || !gender) {
      genderSelect.value = gender;
    } else {
      genderSelect.value = "自定义";
      genderCustomInput.value = gender;
    }
    genderCustomInput.disabled = genderSelect.value !== "自定义";
  };

  const fillProfileForm = () => {
    const account = context.getAccount();
    if (!account) return;
    profileForm.querySelector<HTMLInputElement>("[name=name]")!.value =
      account.profile.name;
    profileForm.querySelector<HTMLInputElement>("[name=handle]")!.value =
      account.profile.handle;
    bioInput.value = account.profile.bio;
    bioCount.textContent = `${[...account.profile.bio].length} / 200`;
    syncGenderField(account.profile.gender);
    profileForm.querySelector<HTMLInputElement>("[name=region]")!.value =
      account.profile.region;
    profileForm.querySelector<HTMLInputElement>("[name=birthday]")!.value =
      account.profile.birthday;
    setStatus(profileStatus, "");
    avatar.setAttribute("style", avatarGradient(account.profile.handle));
    avatar.textContent = [...account.profile.name][0] ?? "?";
    avatarRemove.hidden = !account.avatarUrl;
    if (account.avatarUrl) {
      const image = document.createElement("img");
      image.className = "fk-profile-avatar-image";
      image.src = account.avatarUrl.startsWith("/")
        ? apiEndpoint(account.avatarUrl)
        : account.avatarUrl;
      image.alt = account.profile.name;
      avatar.replaceChildren(image);
    }
  };

  const refreshAccount = async () => {
    await hydrateSession(true);
    const account = getAccount();
    if (!account) return;
    context.setAccount(account);
    fillProfileForm();
  };

  avatarUpload.addEventListener("click", () => avatarInput.click());
  avatarInput.addEventListener("change", async () => {
    const file = avatarInput.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setStatus(profileStatus, "Image cannot exceed 10 MB");
      avatarInput.value = "";
      return;
    }
    avatarUpload.disabled = true;
    setStatus(profileStatus, "Uploading avatar...");
    try {
      const media = await uploadMedia(file);
      await updateAvatar(media.id);
      await refreshAccount();
      setStatus(profileStatus, "Avatar updated");
    } catch (error) {
      setStatus(
        profileStatus,
        error instanceof Error ? error.message : "Avatar upload failed",
      );
    } finally {
      avatarUpload.disabled = false;
      avatarInput.value = "";
    }
  });
  avatarRemove.addEventListener("click", async () => {
    avatarRemove.disabled = true;
    try {
      await updateAvatar(null);
      await refreshAccount();
      setStatus(profileStatus, "Avatar removed");
    } catch (error) {
      setStatus(
        profileStatus,
        error instanceof Error ? error.message : "Failed to remove avatar",
      );
    } finally {
      avatarRemove.disabled = false;
    }
  });

  genderSelect.addEventListener("change", () => {
    genderCustomInput.disabled = genderSelect.value !== "自定义";
    if (!genderCustomInput.disabled) genderCustomInput.focus();
    else genderCustomInput.value = "";
  });

  bioInput.addEventListener("input", () => {
    bioCount.textContent = `${[...bioInput.value].length} / 200`;
  });

  profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!context.getAccount()) return;
    const data = new FormData(profileForm);
    const gender =
      genderSelect.value === "自定义"
        ? String(data.get("genderCustom") ?? "").trim() || "自定义"
        : genderSelect.value;
    const button =
      profileForm.querySelector<HTMLButtonElement>(".fk-primary-btn")!;
    button.disabled = true;
    try {
      const account = await updateProfile({
        name: String(data.get("name") ?? ""),
        bio: String(data.get("bio") ?? ""),
        region: String(data.get("region") ?? ""),
        gender,
        birthday: String(data.get("birthday") ?? ""),
      });
      context.setAccount(account);
      fillProfileForm();
      setStatus(profileStatus, "已保存 ✓");
      setTimeout(() => setStatus(profileStatus, ""), 1500);
    } catch (error) {
      setStatus(
        profileStatus,
        error instanceof Error ? error.message : "保存失败",
      );
    } finally {
      button.disabled = false;
    }
  });

  fillProfileForm();
}
