import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v9';

// Replace these with your actual values
const token = process.env.BOT_TOKEN;
const applicationId = process.env.APPLICATION_ID;
// If you want to wipe guild-specific commands instead, uncomment and set the guildId
// const guildId = 'YOUR_GUILD_ID';

const rest = new REST({ version: '9' }).setToken(token);

(async () => {
  try {
    console.log('Started deleting all slash commands.');

    // For global commands
    await rest.put(Routes.applicationCommands(applicationId), { body: [] });

    // For guild-specific commands (uncomment if needed)
    // await rest.put(Routes.applicationGuildCommands(applicationId, guildId), { body: [] });

    console.log('Successfully deleted all slash commands.');
  } catch (error) {
    console.error('Error deleting commands:', error);
  }
})();