import { CommandInteraction, MessageFlags, ButtonBuilder, ButtonStyle, ContainerBuilder, SectionBuilder, TextDisplayBuilder, ActionRowBuilder, ApplicationIntegrationType, InteractionContextType, SeparatorBuilder, SeparatorSpacingSize, type MessageActionRowComponentBuilder } from "discord.js";
import { Discord, Guard, Slash, SlashGroup } from "discordx";
import { prisma } from "../../main.js";
import { VRChatLoginGuard } from "../../utility/guards.js";

@Discord()
@SlashGroup({
  name: "vrchat",
  description: "VRChat related commands.",
  contexts: [InteractionContextType.Guild, InteractionContextType.PrivateChannel],
  integrationTypes: [ApplicationIntegrationType.UserInstall]
})
@SlashGroup("vrchat")
@Guard(VRChatLoginGuard)
export class VRChatAccountManagerCommand {
  @Slash({
    name: "accountmanager",
    description: "Manage MAIN/ALT status for your verified VRChat accounts.",
  })
  async accountManager(interaction: CommandInteraction) {
    const discordId = interaction.user.id;
    // Get all verified VRChat accounts for this user
    const user = await prisma.user.findUnique({ where: { discordId }, include: { vrchatAccounts: true } });
    if (!user || !user.vrchatAccounts || user.vrchatAccounts.length === 0) {
      await interaction.reply({
        content: "No verified VRChat accounts found for your Discord account.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    // List all verified accounts
    const verifiedAccounts = user.vrchatAccounts.filter(acc => acc.verified);
    if (verifiedAccounts.length === 0) {
      await interaction.reply({
        content: "No verified VRChat accounts found for your Discord account.",
        flags: MessageFlags.Ephemeral
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
            .setCustomId("accountmanager:info")
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            "**Account Manager**\n- You can set one account as MAIN and others as ALT. Only one MAIN is allowed.\n- Switching MAIN/ALT will update the status accordingly. Deleting an account will unfriend it."
          )
        )
    );
    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );
    for (const acc of verifiedAccounts) {
      // Build the display name as a link (replace with actual profile link if available)
      const profileLink = `<https://vrchat.com/home/user/${acc.vrcUserId}>`;
      const displayName = acc.vrcUserId;
      // Location tracking consent status (check friendLocationConsent table)
      const consent = await prisma.friendLocationConsent.findFirst({ where: { ownerVrcUserId: acc.vrcUserId } });
      const consentStatus = consent ? "Tracking: Enabled" : "Tracking: Disabled";
      // Discord ping
      const discordPing = `<@${discordId}>`;
      // Text display for this account
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `[${displayName}](${profileLink}) - ${consentStatus} - Linked to ${discordPing}`
        )
      );
      // Button logic
      const isMain = acc.accountType === "MAIN";
      const isAlt = acc.accountType === "ALT";
      container.addActionRowComponents(
        new ActionRowBuilder<MessageActionRowComponentBuilder>()
          .addComponents(
            new ButtonBuilder()
              .setStyle(ButtonStyle.Success)
              .setLabel("Main")
              .setDisabled(isMain)
              .setCustomId(`accountmanager:main:${acc.vrcUserId}`),
            new ButtonBuilder()
              .setStyle(ButtonStyle.Secondary)
              .setLabel("Alt")
              .setDisabled(isAlt)
              .setCustomId(`accountmanager:alt:${acc.vrcUserId}`),
            new ButtonBuilder()
              .setStyle(ButtonStyle.Danger)
              .setLabel("Unlink (Delete)")
              .setCustomId(`accountmanager:delete:${acc.vrcUserId}`)
          )
      );
    }
    await interaction.reply({
      components: [container],
      flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2]
    });
  }
}
