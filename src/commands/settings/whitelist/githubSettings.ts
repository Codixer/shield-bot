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
import { encrypt, decrypt } from "../../../utility/encryption.js";
import { getEnv } from "../../../config/env.js";

/**
 * Safely mask a token or key to prevent exposure
 * @param value The token/key to mask
 * @returns A masked version of the value
 */
function safeMaskToken(value: string): string {
  const length = value.length;
  
  if (length >= 12) {
    // For tokens >= 12 chars, use the standard 8 + "..." + 4 scheme
    return value.slice(0, 8) + "..." + value.slice(-4);
  } else if (length >= 4) {
    // For tokens 4-11 chars, show first 1-2 and last 1-2 chars
    const prefix = length >= 6 ? 2 : 1;
    const suffix = length >= 6 ? 2 : 1;
    return value.slice(0, prefix) + "..." + value.slice(-suffix);
  } else {
    // For extremely short values (1-3 chars), fully redact
    return "***";
  }
}

@Discord()
@SlashGroup({ name: "whitelist", description: "Whitelist settings", root: "settings" })
@SlashGroup("whitelist", "settings")
@Guard(StaffGuard)
export class WhitelistGitHubSettingsCommand {
  @Slash({
    name: "gh-app-id",
    description: "Set the GitHub App ID for whitelist repository updates",
  })
  async setGitHubAppId(
    @SlashOption({
      name: "app_id",
      description: "GitHub App ID (numeric)",
      type: ApplicationCommandOptionType.String,
      required: false,
    })
    appId: string | undefined,
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

      if (!appId) {
        // Show current setting
        const settings = await prisma.guildSettings.findUnique({
          where: { guildId: interaction.guildId },
        });

        if (!settings?.whitelistGitHubAppId) {
          await interaction.reply({
            content: "ℹ️ No GitHub App ID is currently configured.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        await interaction.reply({
          content: `ℹ️ GitHub App ID is currently set to \`${settings.whitelistGitHubAppId}\``,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Update the setting
      await prisma.guildSettings.upsert({
        where: { guildId: interaction.guildId },
        update: {
          whitelistGitHubAppId: appId,
        },
        create: {
          guildId: interaction.guildId,
          whitelistGitHubAppId: appId,
        },
      });

      await interaction.reply({
        content: "✅ GitHub App ID has been set.",
        flags: MessageFlags.Ephemeral,
      });
    } catch (error: unknown) {
      loggers.bot.error("Error setting GitHub App ID", error);
      await interaction.reply({
        content: `❌ Failed to set GitHub App ID: ${error instanceof Error ? error.message : "Unknown error"}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  @Slash({
    name: "gh-app-key",
    description: "Set the GitHub App private key (PEM format) for whitelist repository updates",
  })
  async setGitHubAppKey(
    @SlashOption({
      name: "private_key",
      description: "GitHub App private key in PEM format (full key including headers)",
      type: ApplicationCommandOptionType.String,
      required: false,
    })
    privateKey: string | undefined,
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

      if (!privateKey) {
        // Show current setting (masked)
        const settings = await prisma.guildSettings.findUnique({
          where: { guildId: interaction.guildId },
        });

        if (!settings?.whitelistGitHubAppPrivateKey) {
          await interaction.reply({
            content: "ℹ️ No GitHub App private key is currently configured.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        // Decrypt the key for masking (handles both encrypted and plaintext)
        const encryptionKey = getEnv().ENCRYPTION_KEY;
        let decryptedKey = settings.whitelistGitHubAppPrivateKey;
        if (encryptionKey) {
          try {
            decryptedKey = await decrypt(settings.whitelistGitHubAppPrivateKey, encryptionKey);
          } catch (error) {
            // If decryption fails, assume it's plaintext (backward compatibility)
            loggers.bot.warn("Failed to decrypt GitHub App private key, assuming plaintext", error);
          }
        }

        // For PEM keys, show a simple masked version (first and last few chars)
        const masked = decryptedKey.length > 50
          ? decryptedKey.slice(0, 30) + "..." + decryptedKey.slice(-20)
          : "***";

        await interaction.reply({
          content: `ℹ️ GitHub App private key is currently set (masked: \`${masked}\`)`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Validate that it looks like a PEM key
      if (!privateKey.includes("BEGIN") || !privateKey.includes("PRIVATE KEY")) {
        await interaction.reply({
          content: "❌ Invalid private key format. Please provide a valid PEM format key (including BEGIN/END headers).",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Encrypt the key before storing
      const encryptionKey = getEnv().ENCRYPTION_KEY;
      let keyToStore = privateKey;
      if (encryptionKey) {
        try {
          keyToStore = await encrypt(privateKey, encryptionKey);
        } catch (error) {
          loggers.bot.error("Failed to encrypt GitHub App private key", error);
          await interaction.reply({
            content: "❌ Failed to encrypt private key. Please check ENCRYPTION_KEY configuration.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
      }

      // Update the setting
      await prisma.guildSettings.upsert({
        where: { guildId: interaction.guildId },
        update: {
          whitelistGitHubAppPrivateKey: keyToStore,
        },
        create: {
          guildId: interaction.guildId,
          whitelistGitHubAppPrivateKey: keyToStore,
        },
      });

      await interaction.reply({
        content: "✅ GitHub App private key has been set.",
        flags: MessageFlags.Ephemeral,
      });
    } catch (error: unknown) {
      loggers.bot.error("Error setting GitHub App private key", error);
      await interaction.reply({
        content: `❌ Failed to set GitHub App private key: ${error instanceof Error ? error.message : "Unknown error"}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  @Slash({
    name: "gh-installation-id",
    description: "Set the GitHub App installation ID for whitelist repository updates",
  })
  async setGitHubInstallationId(
    @SlashOption({
      name: "installation_id",
      description: "GitHub App installation ID (numeric)",
      type: ApplicationCommandOptionType.String,
      required: false,
    })
    installationId: string | undefined,
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

      if (!installationId) {
        // Show current setting
        const settings = await prisma.guildSettings.findUnique({
          where: { guildId: interaction.guildId },
        });

        if (!settings?.whitelistGitHubInstallationId) {
          await interaction.reply({
            content: "ℹ️ No GitHub App installation ID is currently configured.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        await interaction.reply({
          content: `ℹ️ GitHub App installation ID is currently set to \`${settings.whitelistGitHubInstallationId}\``,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Update the setting
      await prisma.guildSettings.upsert({
        where: { guildId: interaction.guildId },
        update: {
          whitelistGitHubInstallationId: installationId,
        },
        create: {
          guildId: interaction.guildId,
          whitelistGitHubInstallationId: installationId,
        },
      });

      await interaction.reply({
        content: "✅ GitHub App installation ID has been set.",
        flags: MessageFlags.Ephemeral,
      });
    } catch (error: unknown) {
      loggers.bot.error("Error setting GitHub App installation ID", error);
      await interaction.reply({
        content: `❌ Failed to set GitHub App installation ID: ${error instanceof Error ? error.message : "Unknown error"}`,
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
      if (owner !== undefined) {
        updateData.whitelistGitHubOwner = owner;
      }
      if (repo !== undefined) {
        updateData.whitelistGitHubRepo = repo;
      }

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
      if (encoded !== undefined) {
        updateData.whitelistGitHubEncodedPath = encoded;
      }
      if (decoded !== undefined) {
        updateData.whitelistGitHubDecodedPath = decoded;
      }

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

        // Decrypt the key for masking (handles both encrypted and plaintext)
        const encryptionKey = getEnv().ENCRYPTION_KEY;
        let decryptedKey = settings.whitelistXorKey;
        if (encryptionKey) {
          try {
            decryptedKey = await decrypt(settings.whitelistXorKey, encryptionKey);
          } catch (error) {
            // If decryption fails, assume it's plaintext (backward compatibility)
            loggers.bot.warn("Failed to decrypt XOR key, assuming plaintext", error);
          }
        }

        const masked = safeMaskToken(decryptedKey);
        await interaction.reply({
          content: `ℹ️ XOR key is currently set (masked: \`${masked}\`)`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Encrypt the key before storing
      const encryptionKey = getEnv().ENCRYPTION_KEY;
      let keyToStore = key;
      if (encryptionKey) {
        try {
          keyToStore = await encrypt(key, encryptionKey);
        } catch (error) {
          loggers.bot.error("Failed to encrypt XOR key", error);
          await interaction.reply({
            content: "❌ Failed to encrypt key. Please check ENCRYPTION_KEY configuration.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
      }

      // Update the setting
      await prisma.guildSettings.upsert({
        where: { guildId: interaction.guildId },
        update: {
          whitelistXorKey: keyToStore,
        },
        create: {
          guildId: interaction.guildId,
          whitelistXorKey: keyToStore,
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

      // Decrypt keys for masking (handles both encrypted and plaintext)
      const encryptionKey = getEnv().ENCRYPTION_KEY;

      const appId = settings?.whitelistGitHubAppId || "Not set";
      
      let appPrivateKey = "Not set";
      if (settings?.whitelistGitHubAppPrivateKey) {
        let decryptedKey = settings.whitelistGitHubAppPrivateKey;
        if (encryptionKey) {
          try {
            decryptedKey = await decrypt(settings.whitelistGitHubAppPrivateKey, encryptionKey);
          } catch (error) {
            // If decryption fails, assume it's plaintext (backward compatibility)
            loggers.bot.warn("Failed to decrypt GitHub App private key in view, assuming plaintext", error);
          }
        }
        // Mask the private key (show first and last few chars)
        appPrivateKey = decryptedKey.length > 50
          ? decryptedKey.slice(0, 30) + "..." + decryptedKey.slice(-20)
          : "***";
      }

      const installationId = settings?.whitelistGitHubInstallationId || "Not set";

      let xorKey = "Not set (using default)";
      if (settings?.whitelistXorKey) {
        let decryptedKey = settings.whitelistXorKey;
        if (encryptionKey) {
          try {
            decryptedKey = await decrypt(settings.whitelistXorKey, encryptionKey);
          } catch (error) {
            // If decryption fails, assume it's plaintext (backward compatibility)
            loggers.bot.warn("Failed to decrypt XOR key in view, assuming plaintext", error);
          }
        }
        xorKey = safeMaskToken(decryptedKey);
      }

      const owner = settings?.whitelistGitHubOwner || "Not set";
      const repo = settings?.whitelistGitHubRepo || "Not set";
      const branch = settings?.whitelistGitHubBranch || "main (default)";
      const encodedPath = settings?.whitelistGitHubEncodedPath || "whitelist.encoded.txt (default)";
      const decodedPath = settings?.whitelistGitHubDecodedPath || "whitelist.txt (default)";

      const embed = new EmbedBuilder()
        .setTitle("🔧 Whitelist GitHub Settings")
        .setColor(Colors.Blue)
        .addFields(
          { name: "GitHub App ID", value: `\`${appId}\``, inline: true },
          { name: "App Private Key", value: `\`${appPrivateKey}\``, inline: true },
          { name: "Installation ID", value: `\`${installationId}\``, inline: true },
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
