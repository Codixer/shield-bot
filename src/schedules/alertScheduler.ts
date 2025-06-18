import { schedule } from "node-cron";
import { prisma } from "../main.js";
import { ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
import { bot } from "../main.js";

const THIRTY_MINUTES = 30 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

export function alertScheduler() {
  schedule("0 * * * *", async () => {
    const now = new Date();
    const alerts = await prisma.pendingAlert.findMany({
      where: { status: "pending" }
    });
    for (const alert of alerts) {
      const created = new Date(alert.createdAt);
      const msSince = now.getTime() - created.getTime();
      const user = await bot.users.fetch(alert.userId).catch(() => null);
      if (msSince > ONE_HOUR) {
        await prisma.pendingAlert.delete({ where: { id: alert.id } });
        if (user) {
          await user.send(`❌ Your alert (${alert.type} for squad ${alert.squad || "N/A"}) was not acknowledged within 1 hour and has been deleted.`).catch(() => {});
        }
        continue;
      } else if (msSince > THIRTY_MINUTES && !alert.lastAlert) {
        if (user) {
          try {
            const button = new ButtonBuilder()
              .setCustomId(`acknowledge_alert_${alert.id}`)
              .setLabel("Acknowledge/Fixed")
              .setStyle(ButtonStyle.Success);
            await user.send({
              content: `⚠️ Alert: ${alert.type} for squad ${alert.squad || "N/A"} has been pending for over 30 minutes! Situation: ${alert.situation}`,
              components: [new ActionRowBuilder<ButtonBuilder>().addComponents(button)]
            });
            await prisma.pendingAlert.update({ where: { id: alert.id }, data: { lastAlert: now } });
          } catch (e) { console.error(e); }
        }
      }
    }
  });
}
