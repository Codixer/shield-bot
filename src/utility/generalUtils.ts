import {
  AutocompleteInteraction,
  CommandInteraction,
  Interaction,
  MessageFlags,
} from "discord.js";

export async function respondWithError(
  interaction: Interaction | CommandInteraction | AutocompleteInteraction,
  message: string,
): Promise<void> {
  if (interaction.isAutocomplete()) {
    await interaction.respond([
      {
        name: message,
        value: "error",
      } as const,
    ]);
  } else {
    await interaction.reply({
      content: message,
      flags: MessageFlags.Ephemeral,
    });
  }
  return;
}
