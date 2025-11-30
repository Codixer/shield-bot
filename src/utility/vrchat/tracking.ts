// Consent and tracking UI methods

import { prisma } from "../../main.js";
import {
  ContainerBuilder,
  SectionBuilder,
  ButtonBuilder,
  ButtonStyle,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
} from "discord.js";

export async function hasFriendLocationConsent(
  ownerVrcUserId: string,
): Promise<boolean> {
  const consent = await prisma.friendLocationConsent.findFirst({
    where: { ownerVrcUserId },
  });
  return !!consent;
}

export function buildLocationTrackingContainer(
  verifiedAccounts: { vrcUserId: string }[],
  consents: Record<string, boolean>,
  usernames: Record<string, string>,
  friendsMap: Record<string, boolean>,
) {
  const container = new ContainerBuilder();
  container.addSectionComponents(
    new SectionBuilder()
      .setButtonAccessory(
        new ButtonBuilder()
          .setLabel("Info")
          .setStyle(ButtonStyle.Secondary)
          .setCustomId("locationtracking:info")
          .setEmoji("ℹ️")
          .setDisabled(true),
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `**Location Tracking System**\n\n` +
            `This system helps you keep track of your verified VRChat accounts, but only under certain conditions:\n` +
            `• Only accounts that are fully verified with the bot will appear in the list below.\n` +
            `• The bot uses VRChat's websockets to receive updates about your location when you are friends.\n` +
            `• For public tracking, you must be in a public, friend+, or friends instance for the bot to keep tracking your location.\n` +
            `• If you are in an invite+ or invite-only instance, you will need to manually invite the bot so it can determine your world.\n`,
        ),
      ),
  );
  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setSpacing(SeparatorSpacingSize.Small)
      .setDivider(true),
  );
  for (const acc of verifiedAccounts) {
    const isTracking = consents[acc.vrcUserId] || false;
    const isFriends = friendsMap[acc.vrcUserId] !== false;
    const button = new ButtonBuilder()
      .setStyle(isTracking ? ButtonStyle.Success : ButtonStyle.Danger)
      .setLabel(isTracking ? "Tracking" : "Not tracking")
      .setCustomId(
        isTracking
          ? `tracking:${acc.vrcUserId}`
          : `nottracking:${acc.vrcUserId}`,
      )
      .setDisabled(!isFriends);
    const username = usernames[acc.vrcUserId] || acc.vrcUserId;
    const section = new SectionBuilder()
      .setButtonAccessory(button)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(username));
    container.addSectionComponents(section);
  }
  return container;
}

/**
 * Extracts the instance number from a public VRChat instance ID string.
 * For example, '14077~region(us)' yields '14077'.
 * Returns undefined if not present or not public.
 */
export function extractInstanceNumber(instanceId: string): string | undefined {
  const match = instanceId.match(/^([0-9]+)~/);
  return match ? match[1] : undefined;
}

/**
 * Resolves world display info for a VRChat user or world shortlink.
 * Returns { worldText, worldName, joinLink, instanceNumber }
 */
export async function resolveWorldDisplay({
  world,
  vrcUserId,
  accountUsername,
  findFriendInstanceOrWorld,
  getFriendInstanceInfo,
  getInstanceInfoByShortName,
  getUserById,
  hasFriendLocationConsent,
}: {
  world?: string;
  vrcUserId: string;
  accountUsername?: string | null;
  findFriendInstanceOrWorld: (vrcUserId: string) => Promise<{ location?: string | null; worldId?: string | null; senderUserId?: string | null } | null>;
  getFriendInstanceInfo: (instanceId: string) => Promise<{ world?: { name?: string } } | null>;
  getInstanceInfoByShortName: (shortName: string) => Promise<{ world?: { name?: string }; instanceId?: string; id?: string; worldId?: string; location?: string; shortName?: string; secureName?: string } | null>;
  getUserById: (vrcUserId: string) => Promise<{ isFriend?: boolean } | null>;
  hasFriendLocationConsent: (vrcUserId: string) => Promise<boolean>;
}): Promise<{
  worldText: string;
  worldName: string;
  joinLink: string;
  instanceNumber?: string;
}> {
  let worldText = "[WORLD NOT FOUND]";
  let worldName = "[WORLD NAME NOT FOUND]";
  let joinLink = "";
  let instanceNumber: string | undefined = undefined;
  if (
    world &&
    (world.startsWith("https://vrc.group/") ||
      world.startsWith("https://vrch.at/"))
  ) {
    const match = world.match(/(?:vrc\.group|vrch\.at)\/([^/?#]+)/);
    const shortName = match ? match[1] : null;
    if (shortName) {
      const instanceInfo = await getInstanceInfoByShortName(shortName);
      worldName = instanceInfo?.world?.name || "[WORLD NAME NOT FOUND]";
      let instanceId = instanceInfo?.instanceId || instanceInfo?.id || "";
      if (typeof instanceId !== "string") {instanceId = String(instanceId);}
      instanceNumber = extractInstanceNumber(instanceId);
      if (instanceNumber) {
        worldName += ` (Instance #${instanceNumber})`;
      }
      if (instanceInfo && instanceId.includes("nonce") && instanceInfo.worldId) {
        joinLink = `https://vrchat.com/home/launch?worldId=${instanceInfo.worldId}&instanceId=${instanceId}`;
      } else if (
        instanceInfo?.location &&
        typeof instanceInfo.location === "string" &&
        instanceInfo.location.includes("nonce") &&
        instanceInfo.worldId
      ) {
        joinLink = `https://vrchat.com/home/launch?worldId=${instanceInfo.worldId}&instanceId=${instanceInfo.location}`;
      } else if (instanceInfo?.shortName) {
        joinLink = `https://vrch.at/${instanceInfo.shortName}`;
      } else if (instanceInfo?.secureName) {
        joinLink = `https://vrch.at/${instanceInfo.secureName}`;
      }
      if (!joinLink) {joinLink = world;}
      worldText = `[${worldName}](${joinLink})`;
      return { worldText, worldName, joinLink, instanceNumber };
    }
  }
  // Fallback to friend location logic
  const vrcUser = await getUserById(vrcUserId);
  if (!vrcUser || !vrcUser.isFriend) {
    worldText =
      "You must be friended with CodixerBot to use location tracking.";
    return { worldText, worldName, joinLink, instanceNumber };
  }
  const consent = await hasFriendLocationConsent(vrcUserId);
  if (!consent) {
    worldText =
      "You must give consent to be tracked. Use `/vrchat locationtracking` to toggle tracking.";
    return { worldText, worldName, joinLink, instanceNumber };
  }
  const friendLocationRecord = await findFriendInstanceOrWorld(vrcUserId);
  if (
    !friendLocationRecord ||
    !friendLocationRecord.location ||
    friendLocationRecord.location === "offline" ||
    friendLocationRecord.worldId === "offline"
  ) {
    worldText =
      "User is offline or not tracked. Please try again when the user is online.";
    return { worldText, worldName, joinLink, instanceNumber };
  } else if (
    friendLocationRecord.location === "private" &&
    (!friendLocationRecord.worldId ||
      friendLocationRecord.worldId === "private")
  ) {
    worldText =
      "User is in a private world or instance. Please provide a shortlink in the world parameter or send an invite to CodixerBot.";
    return { worldText, worldName, joinLink, instanceNumber };
  } else if (
    friendLocationRecord.location === "private" &&
    friendLocationRecord.worldId &&
    friendLocationRecord.senderUserId
  ) {
    const worldInfo = await getFriendInstanceInfo(vrcUserId);
    worldName = worldInfo?.world?.name || "[WORLD NAME NOT FOUND]";
    const senderProfileUrl = `https://vrchat.com/home/user/${friendLocationRecord.senderUserId}`;
    worldText = `${worldName} ([Request invite from ${accountUsername}](<${senderProfileUrl}>))`;
    return { worldText, worldName, joinLink, instanceNumber };
  } else if (
    friendLocationRecord.location &&
    friendLocationRecord.location !== "private"
  ) {
    const worldInfo = await getFriendInstanceInfo(vrcUserId);
    worldName = worldInfo?.world?.name || "[WORLD NAME NOT FOUND]";
    const instanceId = friendLocationRecord.location;
    const worldId = friendLocationRecord.worldId;
    if (worldId && instanceId) {
      joinLink = `https://vrchat.com/home/launch?worldId=${worldId}&instanceId=${instanceId}`;
      instanceNumber = extractInstanceNumber(instanceId);
      if (instanceNumber) {
        worldName += ` (Instance #${instanceNumber})`;
      }
    } else {
      joinLink = "[NO UNLOCKED LINK FOUND]";
    }
    worldText = `[${worldName}](${joinLink})`;
    return { worldText, worldName, joinLink, instanceNumber };
  }
  return { worldText, worldName, joinLink, instanceNumber };
}
