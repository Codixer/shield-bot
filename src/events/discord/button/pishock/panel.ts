import { ButtonComponent, Discord } from "discordx";
import { ButtonInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { PrismaClient } from '@prisma/client';
import { piShockConnectionManager } from "../../../../main.js";
import { PiShockAPI } from "../../../../utility/pishock/api.js";

const prisma = new PrismaClient();

@Discord()
export class PiShockButtonHandler {
  @ButtonComponent({ id: /^pishock_menu:\d+:(intensity|duration|mode|estop):?.*$/ })
  async handle(interaction: ButtonInteraction) {
    // Parse customId: pishock_menu:<stateId>:<field>:<value>
    const [prefix, stateId, field, value] = interaction.customId.split(":");
    if (prefix !== "pishock_menu" || !stateId) return;
    const state = await prisma.piShockPanelState.findUnique({ where: { id: Number(stateId) } });
    if (!state) {
      await interaction.reply({ content: "This control panel is no longer active.", ephemeral: true });
      return;
    }
    // Only owner can interact
    if (interaction.user.id !== state.ownerId) {
      await interaction.reply({ content: "You are not the owner of this control panel.", ephemeral: true });
      return;
    }
    // Handle E-Stop
    if (field === "estop") {
      await prisma.piShockPanelState.update({ where: { id: state.id }, data: { estop: true } });
      // Disable all buttons
      const disabledRow = (row: any) => new ActionRowBuilder<ButtonBuilder>().addComponents(row.components.map((btn: any) => ButtonBuilder.from(btn).setDisabled(true)));
      const rows = interaction.message.components.map(disabledRow);
      await interaction.update({ content: "E-Stop activated. All controls disabled.", components: rows });
      // TODO: Send E-Stop to all devices
      return;
    }
    // Update state
    let update: any = {};
    if (field === "intensity") update.intensity = Number(value);
    if (field === "duration") update.duration = Number(value);
    if (field === "mode") update.mode = value;
    const newState = await prisma.piShockPanelState.update({ where: { id: state.id }, data: update });
    // Rebuild buttons with new state
    const customIdPrefix = `pishock_menu:${stateId}`;
    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      [1,2,3,4,5].map(i => new ButtonBuilder()
        .setCustomId(`${customIdPrefix}:intensity:${i}`)
        .setLabel(i.toString())
        .setStyle(newState.intensity === i ? ButtonStyle.Success : ButtonStyle.Secondary))
    );
    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      [1,2,3,4,5].map(i => new ButtonBuilder()
        .setCustomId(`${customIdPrefix}:duration:${i}`)
        .setLabel(i.toString())
        .setStyle(newState.duration === i ? ButtonStyle.Success : ButtonStyle.Secondary))
    );
    const modeButtons = ['shock','vibrate','beep'].map(mode =>
      new ButtonBuilder()
        .setCustomId(`${customIdPrefix}:mode:${mode}`)
        .setLabel(mode.charAt(0).toUpperCase() + mode.slice(1))
        .setStyle(newState.mode === mode ? ButtonStyle.Success : ButtonStyle.Secondary)
    );
    modeButtons.push(
      new ButtonBuilder().setCustomId(`${customIdPrefix}:estop`).setLabel("E-Stop").setStyle(ButtonStyle.Danger)
    );
    const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(...modeButtons);
    await interaction.update({
      content: `PiShock Control Panel for <@${state.ownerId}>`,
      components: [row1, row2, row3]
    });
    // Send WebSocket command if a mode button was pressed
    if (field === "mode") {
      // Get the user's PiShock device and shocker
      const user = await prisma.user.findUnique({
        where: { discordId: state.ownerId },
        include: { pishockDevices: { include: { shockers: true } } }
      });
      if (!user || !user.pishockDevices.length || !user.pishockDevices[0].shockers.length) {
        await interaction.followUp({ content: "No enrolled PiShock device found.", ephemeral: true });
        return;
      }
      const device = user.pishockDevices[0];
      const shocker = device.shockers[0];
      // Prepare payload
      const payload = {
        id: shocker.shockerId,
        m: newState.mode.charAt(0) as 's' | 'v' | 'b' | 'e', // 's', 'v', or 'b'
        i: newState.intensity * 20, // Example: scale 1-5 to 20-100
        d: newState.duration * 1000, // Example: scale 1-5 to 1-5 seconds
        r: true,
        l: {
          u: Number(user.pishockUserId) || 0,
          ty: 'api' as 'api',
          w: false,
          h: false,
          o: interaction.user.username
        }
      };
      // Use PiShockConnectionManager from main.ts
      const ws = piShockConnectionManager.getConnection(
        user.discordId,
        {
          version: 'v2',
          username: user.pishockApiKey ? user.discordId : '',
          apiKey: user.pishockApiKey || ''
        }
      );
      if (!ws) {
        await interaction.followUp({ content: "WebSocket connection failed.", ephemeral: true });
        return;
      }
      PiShockAPI.sendShock(ws, payload, { clientId: device.clientId });
      await interaction.followUp({ content: `Sent ${newState.mode} command to your PiShock device.`, ephemeral: true });
    }
  }
}
