import { Discord, Slash, SlashGroup, SlashOption } from "discordx";
import { CommandInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, InteractionReplyOptions, ApplicationIntegrationType, InteractionContextType } from "discord.js";
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

@Discord()
@SlashGroup({ 
    name: "pishock", 
    description: "Manage your PiShock integration",
    contexts: [InteractionContextType.Guild, InteractionContextType.PrivateChannel],
    integrationTypes: [ApplicationIntegrationType.UserInstall] 
})
export class PiShockCommands {
  @Slash({ description: "Show PiShock menu" })
  @SlashGroup("pishock")
  async menu(interaction: CommandInteraction) {
    // Check if user has a shocker enrolled
    const user = await prisma.user.findUnique({
      where: { discordId: interaction.user.id },
      include: { pishockDevices: { include: { shockers: true } } }
    });
    if (!user || !user.pishockDevices.length || !user.pishockDevices[0].shockers.length) {
      await interaction.reply({
        content: "You have not enrolled a PiShock device. Please use /pishock login to enroll and select a shocker.",
        ephemeral: true
      });
      return;
    }
    // Default state
    const state = await prisma.piShockPanelState.create({
      data: {
        ownerId: interaction.user.id,
        intensity: 3,
        duration: 3,
        mode: 'shock',
        estop: false,
        messageId: interaction.id // Use interaction.id as the unique key
      }
    });
    // Use the state ID in the customId
    const stateId = state.id;
    const customIdPrefix = `pishock_menu:${stateId}`;
    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      [1,2,3,4,5].map(i => new ButtonBuilder()
        .setCustomId(`${customIdPrefix}:intensity:${i}`)
        .setLabel(i.toString())
        .setStyle(state.intensity === i ? ButtonStyle.Success : ButtonStyle.Secondary))
    );
    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      [1,2,3,4,5].map(i => new ButtonBuilder()
        .setCustomId(`${customIdPrefix}:duration:${i}`)
        .setLabel(i.toString())
        .setStyle(state.duration === i ? ButtonStyle.Success : ButtonStyle.Secondary))
    );
    const modeButtons = ['shock','vibrate','beep'].map(mode =>
      new ButtonBuilder()
        .setCustomId(`${customIdPrefix}:mode:${mode}`)
        .setLabel(mode.charAt(0).toUpperCase() + mode.slice(1))
        .setStyle(state.mode === mode ? ButtonStyle.Success : ButtonStyle.Secondary)
    );
    modeButtons.push(
      new ButtonBuilder().setCustomId(`${customIdPrefix}:estop`).setLabel("E-Stop").setStyle(ButtonStyle.Danger)
    );
    const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(...modeButtons);
    await interaction.reply({
      content: `PiShock Control Panel for <@${interaction.user.id}>`,
      components: [row1, row2, row3],
      ephemeral: true
    });
  }

  @Slash({ description: "Login or enroll your PiShock account" })
  @SlashGroup("pishock")
  async login(interaction: CommandInteraction) {
    const modal = new ModalBuilder()
      .setCustomId("pishock_login_modal")
      .setTitle("PiShock Login/Enroll")
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("pishock_username")
            .setLabel("PiShock Username (optional)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("pishock_apikey")
            .setLabel("API Key (optional)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("pishock_sharecode")
            .setLabel("Share Code (optional)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
        )
      );
    await interaction.showModal(modal);
  }

  @Slash({ description: "Send E-Stop to all your devices" })
  @SlashGroup("pishock")
  async estop(interaction: CommandInteraction) {
    // TODO: Implement E-Stop logic using PiShockAPI and user's credentials from DB
    await interaction.reply({ content: "E-Stop sent to all your enrolled PiShock devices (not yet implemented).", ephemeral: true });
  }
}
