import { CommandInteraction, MessageFlags, ButtonBuilder, ButtonStyle, ContainerBuilder, SectionBuilder, TextDisplayBuilder, ActionRowBuilder, ApplicationIntegrationType, InteractionContextType } from "discord.js";
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
    // Build the container
    const container = new ContainerBuilder();
    container.addSectionComponents(
      new SectionBuilder()
        .setButtonAccessory(
          new ButtonBuilder()
            .setLabel("Info")
            .setStyle(ButtonStyle.Secondary)
            .setCustomId("accountmanager:info")
            .setEmoji("ℹ️")
            .setDisabled(true)
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `**Account Manager**\n\n` +
            `You can set one account as MAIN and others as ALT. Only one MAIN is allowed.\n` +
            `Switching MAIN/ALT will update the status accordingly. Deleting an account will unfriend it.\n`
          )
        )
    );
    for (const acc of verifiedAccounts) {
      const isMain = acc.accountType === "MAIN";
      const isAlt = acc.accountType === "ALT";
      const mainBtn = new ButtonBuilder()
        .setLabel("MAIN")
        .setStyle(ButtonStyle.Primary)
        .setCustomId(`accountmanager:main:${acc.vrcUserId}`)
        .setDisabled(isMain);
      const altBtn = new ButtonBuilder()
        .setLabel("ALT")
        .setStyle(ButtonStyle.Secondary)
        .setCustomId(`accountmanager:alt:${acc.vrcUserId}`)
        .setDisabled(isAlt);
      const delBtn = new ButtonBuilder()
        .setLabel("DELETE")
        .setStyle(ButtonStyle.Danger)
        .setCustomId(`accountmanager:delete:${acc.vrcUserId}`);
      // Use only setButtonAccessory for one button, and add the rest in an ActionRowBuilder
      const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(mainBtn, altBtn, delBtn);
      const section = new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `**${acc.vrcUserId}**`
          )
        )
        .setButtonAccessory(mainBtn); // Only one accessory allowed, but we show all in the action row below
      container.addSectionComponents(section);
      container.addActionRowComponents(actionRow);
    }
    await interaction.reply({
      components: [container],
      flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2]
    });
  }
}
