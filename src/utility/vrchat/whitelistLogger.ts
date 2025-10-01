import { TextDisplayBuilder, MessageFlags, Client, ContainerBuilder } from "discord.js";
import { prisma } from "../../main.js";

export interface WhitelistLogData {
  discordId: string;
  displayName: string;
  vrchatUsername?: string;
  vrcUserId?: string;
  roles: string[];
  action: "verified" | "modified" | "removed";
}

/**
 * Send a whitelist log message using componentsv2
 */
export async function sendWhitelistLog(
  client: Client,
  guildId: string,
  data: WhitelistLogData,
): Promise<void> {
  try {
    // Get the whitelist log channel from guild settings
    const guildSettings = await prisma.guildSettings.findUnique({
      where: { guildId },
      select: { whitelistLogChannelId: true },
    });

    if (!guildSettings?.whitelistLogChannelId) {
      console.log(
        `[WhitelistLogger] No whitelist log channel configured for guild ${guildId}`,
      );
      return;
    }

    // Fetch the log channel
    const channel = await client.channels.fetch(
      guildSettings.whitelistLogChannelId,
    );
    if (
      !channel ||
      !channel.isTextBased() ||
      !("send" in channel)
    ) {
      console.warn(
        `[WhitelistLogger] Invalid log channel ${guildSettings.whitelistLogChannelId} for guild ${guildId}`,
      );
      return;
    }

    // Build the log message content
    const content = buildLogContent(data);

    // Create the text display component with the content
    const textDisplay = new TextDisplayBuilder()
      .setContent(content);

    // Create a container with yellow sidebar
    const container = new ContainerBuilder()
      .setAccentColor(0xffd700) // Yellow/gold color
      .addTextDisplayComponents([textDisplay]);

    // Send the message with componentsv2
    await channel.send({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    });

    console.log(
      `[WhitelistLogger] Logged ${data.action} action for ${data.displayName} in guild ${guildId}`,
    );
  } catch (error) {
    console.error(
      `[WhitelistLogger] Failed to send whitelist log for guild ${guildId}:`,
      error,
    );
  }
}

/**
 * Build the log message content based on the action
 */
function buildLogContent(data: WhitelistLogData): string {
  const userMention = `<@${data.discordId}>`;
  
  // Build VRChat account display with link
  let vrchatDisplay = data.vrchatUsername || "Unknown VRChat user";
  if (data.vrcUserId) {
    const vrcLink = `https://vrchat.com/home/user/${encodeURIComponent(data.vrcUserId)}`;
    vrchatDisplay = `[${vrchatDisplay}](${vrcLink})`;
  }

  // Build roles list
  const rolesDisplay = data.roles.length
    ? data.roles.map((role) => `\`${escapeMarkdown(role)}\``).join(", ")
    : "none";

  // Build message based on action
  switch (data.action) {
    case "verified":
      return `${userMention} - Verified with ${vrchatDisplay} and obtained ${rolesDisplay}.`;
    case "modified":
      return `${userMention} - Whitelist modified for ${vrchatDisplay} with roles ${rolesDisplay}.`;
    case "removed":
      return `${userMention} - Whitelist access removed for ${vrchatDisplay} (had roles: ${rolesDisplay}).`;
    default:
      return `${userMention} - Whitelist action for ${vrchatDisplay}: ${rolesDisplay}`;
  }
}

/**
 * Escape markdown special characters
 */
function escapeMarkdown(text: string): string {
  return text.replace(/([\\*_`~|])/g, "\\$1");
}

/**
 * Get user's whitelist roles from database
 */
export async function getUserWhitelistRoles(
  discordId: string,
): Promise<string[]> {
  try {
    const user = await prisma.user.findUnique({
      where: { discordId },
      include: {
        whitelistEntry: {
          include: {
            roleAssignments: {
              include: {
                role: true,
              },
            },
          },
        },
      },
    });

    // Extract VRChat roles from description field (comma-separated)
    const roles = new Set<string>();
    for (const assignment of user?.whitelistEntry?.roleAssignments || []) {
      if (assignment.role.description) {
        for (const role of String(assignment.role.description)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)) {
          roles.add(role);
        }
      }
    }
    return Array.from(roles).sort();
  } catch (error) {
    console.error(
      `[WhitelistLogger] Failed to get whitelist roles for ${discordId}:`,
      error,
    );
    return [];
  }
}

/**
 * Get VRChat account info for a Discord user
 */
export async function getVRChatAccountInfo(discordId: string): Promise<{
  vrchatUsername?: string;
  vrcUserId?: string;
} | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { discordId },
      include: {
        vrchatAccounts: {
          where: {
            accountType: {
              in: ["MAIN", "ALT"],
            },
          },
          orderBy: {
            accountType: "asc", // MAIN comes before ALT
          },
          take: 1,
        },
      },
    });

    const account = user?.vrchatAccounts?.[0];
    if (!account) return null;

    return {
      vrchatUsername: account.vrchatUsername || undefined,
      vrcUserId: account.vrcUserId,
    };
  } catch (error) {
    console.error(
      `[WhitelistLogger] Failed to get VRChat account info for ${discordId}:`,
      error,
    );
    return null;
  }
}
