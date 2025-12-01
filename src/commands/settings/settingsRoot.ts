import { Discord, SlashGroup } from "discordx";

@Discord()
// Root settings group definition
@SlashGroup({
  name: "settings",
  description: "Bot configuration and settings commands",
})
// Assign subsequent slashes in this class to the root group
export class SettingsRootGroup {}
