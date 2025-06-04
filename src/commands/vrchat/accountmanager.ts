import { CommandInteraction, MessageFlags, ButtonBuilder, ButtonStyle, ContainerBuilder, SectionBuilder, TextDisplayBuilder, ActionRowBuilder, ApplicationIntegrationType, InteractionContextType, SeparatorBuilder, SeparatorSpacingSize, type MessageActionRowComponentBuilder } from "discord.js";
import { Discord, Guard, Slash, SlashGroup } from "discordx";
import { prisma } from "../../main.js";
import { VRChatLoginGuard } from "../../utility/guards.js";
import { getUserById } from "../../utility/vrchat/user.js";

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
    // Build a map of usernames for all verified accounts
    const usernames: Record<string, string> = {};
    for (const acc of verifiedAccounts) {
      try {
        const vrcUser = await getUserById(acc.vrcUserId);
        usernames[acc.vrcUserId] = vrcUser?.displayName || acc.vrcUserId;
      } catch {
        usernames[acc.vrcUserId] = acc.vrcUserId;
      }
    }
    for (const acc of verifiedAccounts) {
      const profileLink = `<https://vrchat.com/home/user/${acc.vrcUserId}>`;
      const displayName = usernames[acc.vrcUserId] || acc.vrcUserId;
      const consent = await prisma.friendLocationConsent.findFirst({ where: { ownerVrcUserId: acc.vrcUserId } });
      const consentStatus = consent ? "Tracking: Enabled" : "Tracking: Disabled";
      const discordPing = `<@${discordId}>`;
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `[${displayName}](${profileLink}) - ${consentStatus} - Linked to ${discordPing}`
        )
      );
      const isMain = acc.accountType === "MAIN";
      const isAlt = acc.accountType === "ALT";
      // Button color/enable logic
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
        new ActionRowBuilder<MessageActionRowComponentBuilder>()
          .addComponents(
            new ButtonBuilder()
              .setStyle(mainBtnStyle)
              .setLabel("Main")
              .setDisabled(mainBtnDisabled)
              .setCustomId(`accountmanager:main:${acc.vrcUserId}`),
            new ButtonBuilder()
              .setStyle(altBtnStyle)
              .setLabel("Alt")
              .setDisabled(altBtnDisabled)
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
