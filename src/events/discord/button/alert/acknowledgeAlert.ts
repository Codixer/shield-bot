import { Discord, ButtonComponent } from "discordx";
import { ButtonInteraction } from "discord.js";
import { prisma } from "../../../../main.js";

@Discord()
export class AlertAcknowledgeButtonHandler {
  @ButtonComponent({ id: /^acknowledge_alert_/ })
  async handleAcknowledgeAlert(interaction: ButtonInteraction) {
    const parts = interaction.customId.split("_");
    const alertId = parts.slice(2).join("_"); // Handles IDs with underscores
    const alert = await prisma.pendingAlert.findUnique({ where: { id: alertId } });
    if (!alert) {
      await interaction.reply({ content: "Alert not found or already resolved.", ephemeral: true });
      return;
    }
    await prisma.pendingAlert.delete({ where: { id: alertId } });
    await interaction.reply({ content: "✅ Alert acknowledged and removed.", ephemeral: true });
  }
}
