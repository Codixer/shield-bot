import { Discord, Guard, Slash, SlashGroup, SlashOption } from "discordx";
import {
  CommandInteraction,
  ApplicationCommandOptionType,
  MessageFlags,
  EmbedBuilder,
  Colors,
} from "discord.js";
import { StaffGuard } from "../../../utility/guards.js";
import { prisma } from "../../../main.js";
import { loggers } from "../../../utility/logger.js";

@Discord()
@SlashGroup({ name: "whitelist", description: "Whitelist settings", root: "settings" })
@SlashGroup("whitelist", "settings")
@Guard(StaffGuard)
export class WhitelistGitHubSettingsCommand {
  @Slash({
    name: "gh-token",
    description: "Set the GitHub token for whitelist repository updates",
  })
  async setGitHubToken(
    @SlashOption({
      name: "token",
      description: "GitHub personal access token",
      type: ApplicationCommandOptionType.String,
      required: false,
    })
    token: string | undefined,
    interaction: CommandInteraction,
  ): Promise<void> {
    try {
      if (!interaction.guildId) {
        await interaction.reply({
          content: "❌ This command can only be used in a server.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (!token) {
        // Show current setting (masked)
        const settings = await prisma.guildSettings.findUnique({
          where: { guildId: interaction.guildId },
        });

        if (!settings?.whitelistGitHubToken) {
          await interaction.reply({
            content: "ℹ️ No GitHub token is currently configured.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const masked = settings.whitelistGitHubToken.slice(0, 8) + "..." + settings.whitelistGitHubToken.slice(-4);
        await interaction.reply({
          content: `ℹ️ GitHub token is currently set (masked: \`${masked}\`)`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Update the setting
      await prisma.guildSettings.upsert({
        where: { guildId: interaction.guildId },
        update: {
          whitelistGitHubToken: token,
        },
        create: {
          guildId: interaction.guildId,
          whitelistGitHubToken: token,
        },
      });

      await interaction.reply({
        content: "✅ GitHub token has been set.",
        flags: MessageFlags.Ephemeral,
      });
    } catch (error: unknown) {
      loggers.bot.error("Error setting GitHub token", error);
      await interaction.reply({
        content: `❌ Failed to set GitHub token: ${error instanceof Error ? error.message : "Unknown error"}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  @Slash({
    name: "gh-repo",
    description: "Set the GitHub repository (owner/repo) for whitelist updates",
  })
  async setGitHubRepo(
    @SlashOption({
      name: "owner",
      description: "GitHub repository owner (username or organization)",
      type: ApplicationCommandOptionType.String,
      required: false,
    })
    owner: string | undefined,
    @SlashOption({
      name: "repo",
      description: "GitHub repository name",
      type: ApplicationCommandOptionType.String,
      required: false,
    })
    repo: string | undefined,
    interaction: CommandInteraction,
  ): Promise<void> {
    try {
      if (!interaction.guildId) {
        await interaction.reply({
          content: "❌ This command can only be used in a server.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const settings = await prisma.guildSettings.findUnique({
        where: { guildId: interaction.guildId },
      });

      if (!owner && !repo) {
        // Show current settings
        if (!settings?.whitelistGitHubOwner && !settings?.whitelistGitHubRepo) {
          await interaction.reply({
            content: "ℹ️ No GitHub repository is currently configured.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const currentOwner = settings.whitelistGitHubOwner || "Not set";
        const currentRepo = settings.whitelistGitHubRepo || "Not set";
        await interaction.reply({
          content: `ℹ️ GitHub repository: **${currentOwner}/${currentRepo}**`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Update the settings
      const updateData: { whitelistGitHubOwner?: string; whitelistGitHubRepo?: string } = {};
      if (owner !== undefined) updateData.whitelistGitHubOwner = owner;
      if (repo !== undefined) updateData.whitelistGitHubRepo = repo;

      await prisma.guildSettings.upsert({
        where: { guildId: interaction.guildId },
        update: updateData,
        create: {
          guildId: interaction.guildId,
          ...updateData,
        },
      });

      const updatedOwner = owner ?? settings?.whitelistGitHubOwner ?? "Not set";
      const updatedRepo = repo ?? settings?.whitelistGitHubRepo ?? "Not set";
      await interaction.reply({
        content: `✅ GitHub repository has been set to **${updatedOwner}/${updatedRepo}**`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (error: unknown) {
      loggers.bot.error("Error setting GitHub repository", error);
      await interaction.reply({
        content: `❌ Failed to set GitHub repository: ${error instanceof Error ? error.message : "Unknown error"}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  @Slash({
    name: "gh-branch",
    description: "Set the GitHub branch for whitelist updates (default: main)",
  })
  async setGitHubBranch(
    @SlashOption({
      name: "branch",
      description: "GitHub branch name",
      type: ApplicationCommandOptionType.String,
      required: false,
    })
    branch: string | undefined,
    interaction: CommandInteraction,
  ): Promise<void> {
    try {
      if (!interaction.guildId) {
        await interaction.reply({
          content: "❌ This command can only be used in a server.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (!branch) {
        // Show current setting
        const settings = await prisma.guildSettings.findUnique({
          where: { guildId: interaction.guildId },
        });

        const currentBranch = settings?.whitelistGitHubBranch || "main (default)";
        await interaction.reply({
          content: `ℹ️ GitHub branch is currently set to \`${currentBranch}\``,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Update the setting
      await prisma.guildSettings.upsert({
        where: { guildId: interaction.guildId },
        update: {
          whitelistGitHubBranch: branch,
        },
        create: {
          guildId: interaction.guildId,
          whitelistGitHubBranch: branch,
        },
      });

      await interaction.reply({
        content: `✅ GitHub branch has been set to \`${branch}\``,
        flags: MessageFlags.Ephemeral,
      });
    } catch (error: unknown) {
      loggers.bot.error("Error setting GitHub branch", error);
      await interaction.reply({
        content: `❌ Failed to set GitHub branch: ${error instanceof Error ? error.message : "Unknown error"}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  @Slash({
    name: "gh-paths",
    description: "Set the file paths for encoded and decoded whitelist files",
  })
  async setGitHubPaths(
    @SlashOption({
      name: "encoded",
      description: "Path for encoded whitelist file",
      type: ApplicationCommandOptionType.String,
      required: false,
    })
    encoded: string | undefined,
    @SlashOption({
      name: "decoded",
      description: "Path for decoded whitelist file",
      type: ApplicationCommandOptionType.String,
      required: false,
    })
    decoded: string | undefined,
    interaction: CommandInteraction,
  ): Promise<void> {
    try {
      if (!interaction.guildId) {
        await interaction.reply({
          content: "❌ This command can only be used in a server.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const settings = await prisma.guildSettings.findUnique({
        where: { guildId: interaction.guildId },
      });

      if (!encoded && !decoded) {
        // Show current settings
        const currentEncoded = settings?.whitelistGitHubEncodedPath || "whitelist.encoded.txt (default)";
        const currentDecoded = settings?.whitelistGitHubDecodedPath || "whitelist.txt (default)";
        await interaction.reply({
          content: `ℹ️ File paths:\n**Encoded:** \`${currentEncoded}\`\n**Decoded:** \`${currentDecoded}\``,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Update the settings
      const updateData: { whitelistGitHubEncodedPath?: string; whitelistGitHubDecodedPath?: string } = {};
      if (encoded !== undefined) updateData.whitelistGitHubEncodedPath = encoded;
      if (decoded !== undefined) updateData.whitelistGitHubDecodedPath = decoded;

      await prisma.guildSettings.upsert({
        where: { guildId: interaction.guildId },
        update: updateData,
        create: {
          guildId: interaction.guildId,
          ...updateData,
        },
      });

      const updatedEncoded = encoded ?? settings?.whitelistGitHubEncodedPath ?? "whitelist.encoded.txt (default)";
      const updatedDecoded = decoded ?? settings?.whitelistGitHubDecodedPath ?? "whitelist.txt (default)";
      await interaction.reply({
        content: `✅ File paths updated:\n**Encoded:** \`${updatedEncoded}\`\n**Decoded:** \`${updatedDecoded}\``,
        flags: MessageFlags.Ephemeral,
      });
    } catch (error: unknown) {
      loggers.bot.error("Error setting GitHub paths", error);
      await interaction.reply({
        content: `❌ Failed to set GitHub paths: ${error instanceof Error ? error.message : "Unknown error"}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  @Slash({
    name: "gh-key",
    description: "Set the XOR key for whitelist encoding",
  })
  async setXorKey(
    @SlashOption({
      name: "key",
      description: "XOR encryption key",
      type: ApplicationCommandOptionType.String,
      required: false,
    })
    key: string | undefined,
    interaction: CommandInteraction,
  ): Promise<void> {
    try {
      if (!interaction.guildId) {
        await interaction.reply({
          content: "❌ This command can only be used in a server.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (!key) {
        // Show current setting (masked)
        const settings = await prisma.guildSettings.findUnique({
          where: { guildId: interaction.guildId },
        });

        if (!settings?.whitelistXorKey) {
          await interaction.reply({
            content: "ℹ️ No XOR key is currently configured (using default).",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const masked = settings.whitelistXorKey.slice(0, 8) + "..." + settings.whitelistXorKey.slice(-4);
        await interaction.reply({
          content: `ℹ️ XOR key is currently set (masked: \`${masked}\`)`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Update the setting
      await prisma.guildSettings.upsert({
        where: { guildId: interaction.guildId },
        update: {
          whitelistXorKey: key,
        },
        create: {
          guildId: interaction.guildId,
          whitelistXorKey: key,
        },
      });

      await interaction.reply({
        content: "✅ XOR key has been set.",
        flags: MessageFlags.Ephemeral,
      });
    } catch (error: unknown) {
      loggers.bot.error("Error setting XOR key", error);
      await interaction.reply({
        content: `❌ Failed to set XOR key: ${error instanceof Error ? error.message : "Unknown error"}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  @Slash({
    name: "view",
    description: "View all whitelist GitHub settings",
  })
  async viewSettings(interaction: CommandInteraction): Promise<void> {
    try {
      if (!interaction.guildId) {
        await interaction.reply({
          content: "❌ This command can only be used in a server.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const settings = await prisma.guildSettings.findUnique({
        where: { guildId: interaction.guildId },
      });

      const token = settings?.whitelistGitHubToken
        ? settings.whitelistGitHubToken.slice(0, 8) + "..." + settings.whitelistGitHubToken.slice(-4)
        : "Not set";
      const owner = settings?.whitelistGitHubOwner || "Not set";
      const repo = settings?.whitelistGitHubRepo || "Not set";
      const branch = settings?.whitelistGitHubBranch || "main (default)";
      const encodedPath = settings?.whitelistGitHubEncodedPath || "whitelist.encoded.txt (default)";
      const decodedPath = settings?.whitelistGitHubDecodedPath || "whitelist.txt (default)";
      const xorKey = settings?.whitelistXorKey
        ? settings.whitelistXorKey.slice(0, 8) + "..." + settings.whitelistXorKey.slice(-4)
        : "Not set (using default)";

      const embed = new EmbedBuilder()
        .setTitle("🔧 Whitelist GitHub Settings")
        .setColor(Colors.Blue)
        .addFields(
          { name: "GitHub Token", value: `\`${token}\``, inline: true },
          { name: "Repository", value: `${owner}/${repo}`, inline: true },
          { name: "Branch", value: `\`${branch}\``, inline: true },
          { name: "Encoded Path", value: `\`${encodedPath}\``, inline: true },
          { name: "Decoded Path", value: `\`${decodedPath}\``, inline: true },
          { name: "XOR Key", value: `\`${xorKey}\``, inline: true },
        )
        .setFooter({ text: "S.H.I.E.L.D. Bot - Whitelist Settings" })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch (error: unknown) {
      loggers.bot.error("Error viewing whitelist GitHub settings", error);
      await interaction.reply({
        content: `❌ Failed to view settings: ${error instanceof Error ? error.message : "Unknown error"}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}
