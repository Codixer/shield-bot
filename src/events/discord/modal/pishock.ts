import { ModalComponent, Discord } from "discordx";
import { ModalSubmitInteraction } from "discord.js";
import { PrismaClient } from '@prisma/client';
import { PiShockAPI } from "../../../utility/pishock/api.js";

const prisma = new PrismaClient();

@Discord()
export class PiShockModalHandler {
  @ModalComponent({ id: /^pishock_login_modal$/ })
  async handle(interaction: ModalSubmitInteraction) {
    const discordId = interaction.user.id;
    const username = interaction.fields.getTextInputValue("pishock_username")?.trim() || null;
    const apiKey = interaction.fields.getTextInputValue("pishock_apikey")?.trim() || null;
    const shareCode = interaction.fields.getTextInputValue("pishock_sharecode")?.trim() || null;

    if (!apiKey && !shareCode) {
      await interaction.reply({ content: "You must provide either an API Key or a Share Code.", ephemeral: true });
      return;
    }

    // Upsert user
    let pishockUserId: string | null = null;
    let pishockToken: string | null = null;
    if (apiKey && username) {
      try {
        const fetchedId = await PiShockAPI.getUserId({ username, apiKey });
        pishockUserId = fetchedId != null ? String(fetchedId) : null;
        pishockToken = apiKey;
      } catch (e) {
        await interaction.reply({ content: "Failed to fetch PiShock UserID. Please check your credentials.", ephemeral: true });
        return;
      }
    }
    let user = await prisma.user.upsert({
      where: { discordId },
      update: { pishockApiKey: apiKey, pishockUserId, pishockToken },
      create: { discordId, pishockApiKey: apiKey, pishockUserId, pishockToken }
    });

    // If API Key, fetch and upsert devices and shockers
    if (apiKey) {
      // Use PiShockAPI to fetch devices
      let devices: any[] = [];
      try {
        devices = await PiShockAPI.getDevices({ username: username || discordId, apiKey });
      } catch (e) {
        await interaction.reply({ content: "Failed to fetch devices from PiShock API. Please check your credentials.", ephemeral: true });
        return;
      }
      // Upsert devices and shockers using composite unique constraints workaround
      for (const device of devices) {
        // Find device by composite unique constraint
        let dbDevice = await prisma.piShockDevice.findUnique({
          where: { clientId_userId: { clientId: device.clientId, userId: user.id } }
        } as any);
        if (dbDevice) {
          dbDevice = await prisma.piShockDevice.update({
            where: { id: dbDevice.id },
            data: { name: device.name }
          });
        } else {
          dbDevice = await prisma.piShockDevice.create({
            data: { clientId: device.clientId, name: device.name, userId: user.id }
          });
        }
        for (const shocker of device.shockers) {
          let dbShocker = await prisma.piShockShocker.findUnique({
            where: { shockerId_deviceId: { shockerId: shocker.shockerId, deviceId: dbDevice.id } }
          } as any);
          if (dbShocker) {
            await prisma.piShockShocker.update({
              where: { id: dbShocker.id },
              data: { name: shocker.name, isPaused: shocker.isPaused }
            });
          } else {
            await prisma.piShockShocker.create({
              data: { shockerId: shocker.shockerId, name: shocker.name, isPaused: shocker.isPaused, deviceId: dbDevice.id }
            });
          }
        }
      }
    }

    // If Share Code, upsert a PiShockShare record using composite unique constraint workaround
    if (shareCode) {
      // You may want to fetch share info from PiShock API for full details
      let dbShare = await prisma.piShockShare.findUnique({
        where: { shareCode_shockerId_userId: { shareCode, shockerId: 0, userId: user.id } }
      } as any);
      if (dbShare) {
        await prisma.piShockShare.update({
          where: { id: dbShare.id },
          data: { clientId: 0, shockerName: '', isPaused: false }
        });
      } else {
        await prisma.piShockShare.create({
          data: { shareCode, shockerId: 0, userId: user.id, shareId: 0, clientId: 0, shockerName: '', isPaused: false }
        });
      }
    }

    await interaction.reply({ content: "Your PiShock credentials have been saved and devices enrolled. You can now use the PiShock menu!", ephemeral: true });
  }
}
