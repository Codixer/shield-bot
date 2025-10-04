import {
  CommandInteraction,
  MessageFlags,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ActionRowBuilder,
  ApplicationIntegrationType,
  InteractionContextType,
  SeparatorBuilder,
  SeparatorSpacingSize,
  type MessageActionRowComponentBuilder,
  ApplicationCommandOptionType,
  User,
} from "discord.js";
import { Discord, Guard, Slash, SlashGroup, SlashOption } from "discordx";
import { prisma } from "../../../main.js";
import { VRChatLoginGuard } from "../../../utility/guards.js";
import { StaffGuard } from "../../../utility/guards.js";

@Discord()
@SlashGroup({
  name: "verify",
  description: "VRChat verification commands.",
  contexts: [
    InteractionContextType.Guild,
  ],
  integrationTypes: [
    ApplicationIntegrationType.GuildInstall,
  ],
})
@SlashGroup("verify")
@Guard(VRChatLoginGuard, StaffGuard)
export class VRChatStaffManagerCommand {
  @Slash({
    name: "staff-manage",
    description: "[Staff] Manage MAIN/ALT status for any user's VRChat accounts.",
  })
  async staffManage(
    @SlashOption({
      name: "user",
      description: "The Discord user whose VRChat accounts you want to manage",
      type: ApplicationCommandOptionType.User,
      required: true,
    })
    targetUser: User,
    interaction: CommandInteraction,
  ) {
    const discordId = targetUser.id;

    // Get all VRChat accounts for the target user
    const user = await prisma.user.findUnique({
      where: { discordId },
      include: { vrchatAccounts: true },
    });

    if (!user || !user.vrchatAccounts || user.vrchatAccounts.length === 0) {
      await interaction.reply({
        content: `No VRChat accounts found for ${targetUser.tag} (${targetUser.id}).`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Separate verified and unverified accounts
    const verifiedAccounts = user.vrchatAccounts.filter(
      (acc: any) => acc.accountType === "MAIN" || acc.accountType === "ALT",
    );
    const unverifiedAccounts = user.vrchatAccounts.filter(
      (acc: any) => acc.accountType === "UNVERIFIED",
    );

    if (verifiedAccounts.length === 0 && unverifiedAccounts.length === 0) {
      await interaction.reply({
        content: `No VRChat accounts found for ${targetUser.tag} (${targetUser.id}).`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Build the container using the new structure
    const container = new ContainerBuilder();

    container.addSectionComponents(
      new SectionBuilder()
        .setButtonAccessory(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Secondary)
            .setLabel("Info")
            .setEmoji({ name: "ℹ️" })
            .setDisabled(true)
            .setCustomId("staffaccountmanager:info"),
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `**Staff Account Manager** - Managing accounts for ${targetUser.tag}\n- Only **verified** accounts can be set as MAIN/ALT. Unverified accounts have basic whitelist access only.\n- One MAIN account allowed. Deleting an account will unfriend it.\n- Username updates require being friended with the bot.`,
          ),
        ),
    );

    container.addSeparatorComponents(
      new SeparatorBuilder()
        .setSpacing(SeparatorSpacingSize.Small)
        .setDivider(true),
    );

    // Show verified accounts first
    if (verifiedAccounts.length > 0) {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent("**🔒 Verified Accounts**"),
      );

      for (const acc of verifiedAccounts) {
        const profileLink = `<https://vrchat.com/home/user/${acc.vrcUserId}>`;
        const displayName = acc.vrchatUsername || acc.vrcUserId;
        const consent = await prisma.friendLocationConsent.findFirst({
          where: { ownerVrcUserId: acc.vrcUserId },
        });
        const consentStatus = consent
          ? "Tracking: Enabled"
          : "Tracking: Disabled";
        const discordPing = `<@${discordId}>`;

        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `[${displayName}](${profileLink}) - ${consentStatus} - Linked to ${discordPing}`,
          ),
        );

        const isMain = acc.accountType === "MAIN";
        const isAlt = acc.accountType === "ALT";

        // Button color/enable logic for verified accounts
        let mainBtnStyle = ButtonStyle.Primary;
        let mainBtnDisabled = false;
        let altBtnStyle = ButtonStyle.Secondary;
        let altBtnDisabled = false;

        if (isMain) {
          mainBtnStyle = ButtonStyle.Success; // Green
          mainBtnDisabled = true;
          altBtnStyle = ButtonStyle.Secondary; // Gray
          altBtnDisabled = false;
        } else if (isAlt) {
          mainBtnStyle = ButtonStyle.Secondary; // Gray
          mainBtnDisabled = false;
          altBtnStyle = ButtonStyle.Primary; // Blue
          altBtnDisabled = true;
        }

        container.addActionRowComponents(
          new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder()
              .setStyle(mainBtnStyle)
              .setLabel("Main")
              .setDisabled(mainBtnDisabled)
              .setCustomId(
                `staffaccountmanager:main:${discordId}:${acc.vrcUserId}`,
              ),
            new ButtonBuilder()
              .setStyle(altBtnStyle)
              .setLabel("Alt")
              .setDisabled(altBtnDisabled)
              .setCustomId(
                `staffaccountmanager:alt:${discordId}:${acc.vrcUserId}`,
              ),
            new ButtonBuilder()
              .setStyle(ButtonStyle.Danger)
              .setLabel("Unlink (Delete)")
              .setCustomId(
                `staffaccountmanager:delete:${discordId}:${acc.vrcUserId}`,
              ),
          ),
        );
      }
    }

    // Show unverified accounts
    if (unverifiedAccounts.length > 0) {
      if (verifiedAccounts.length > 0) {
        container.addSeparatorComponents(
          new SeparatorBuilder()
            .setSpacing(SeparatorSpacingSize.Small)
            .setDivider(true),
        );
      }

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          "**⚠️ Unverified Accounts (Whitelist Access Only)**",
        ),
      );

      for (const acc of unverifiedAccounts) {
        const profileLink = `<https://vrchat.com/home/user/${acc.vrcUserId}>`;
        const displayName = acc.vrchatUsername || acc.vrcUserId;
        const discordPing = `<@${discordId}>`;

        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `[${displayName}](${profileLink}) - **Can be taken over** - Linked to ${discordPing}`,
          ),
        );

        // Only show delete button for unverified accounts
        container.addActionRowComponents(
          new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder()
              .setStyle(ButtonStyle.Secondary)
              .setLabel("Main")
              .setDisabled(true)
              .setCustomId(`disabled:main:${acc.vrcUserId}`),
            new ButtonBuilder()
              .setStyle(ButtonStyle.Secondary)
              .setLabel("Alt")
              .setDisabled(true)
              .setCustomId(`disabled:alt:${acc.vrcUserId}`),
            new ButtonBuilder()
              .setStyle(ButtonStyle.Danger)
              .setLabel("Unlink (Delete)")
              .setCustomId(
                `staffaccountmanager:delete:${discordId}:${acc.vrcUserId}`,
              ),
          ),
        );
      }
    }

    await interaction.reply({
      components: [container],
      flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
    });
  }
}
