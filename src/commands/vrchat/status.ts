/**
 * VRChat Status Command
 * 
 * Fetches and displays the current status of VRChat services from their official status page.
 * This command retrieves the latest incidents and service updates from status.vrchat.com
 * and presents them in a user-friendly Discord embed format.
 * 
 * Features:
 * - Shows up to 3 most recent status entries
 * - Color-coded status indicators (green for operational, red for issues)
 * - Emoji status indicators for different types of updates
 * - Links to detailed incident reports
 * - Automatic detection of active vs resolved issues
 * 
 * Usage: /vrchat status
 */

import { Discord, Slash, SlashGroup } from "discordx";
import {
  CommandInteraction,
  MessageFlags,
  InteractionContextType,
  ApplicationIntegrationType,
  EmbedBuilder,
} from "discord.js";
import fetch from "node-fetch";

interface StatusEntry {
  title: string;
  published: string;
  content: string;
  link: string;
}

@Discord()
@SlashGroup({
  name: "vrchat",
  description: "VRChat related commands.",
  contexts: [
    InteractionContextType.Guild,
  ],
  integrationTypes: [
    ApplicationIntegrationType.GuildInstall,
  ],
})
@SlashGroup("vrchat")
export class VRChatStatusCommand {
  @Slash({
    name: "status",
    description: "Check the current status of VRChat services from their status page.",
  })
  async status(interaction: CommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      // Fetch the VRChat status Atom feed
      const response = await fetch("https://status.vrchat.com/history.atom");
      
      if (!response.ok) {
        await interaction.editReply({
          content: `❌ Failed to fetch VRChat status: ${response.status} ${response.statusText}`,
        });
        return;
      }

      const atomContent = await response.text();
      
      // Parse entries using regex (more reliable than DOM parsing for this use case)
      const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
      const entries: StatusEntry[] = [];
      let match;
      
      while ((match = entryRegex.exec(atomContent)) !== null && entries.length < 3) {
        const entryContent = match[1];
        
        // Extract title
        const titleMatch = entryContent.match(/<title[^>]*>(.*?)<\/title>/);
        const title = titleMatch ? titleMatch[1].trim() : "Unknown Issue";
        
        // Extract published date
        const publishedMatch = entryContent.match(/<published[^>]*>(.*?)<\/published>/);
        const published = publishedMatch ? publishedMatch[1].trim() : "";
        
        // Extract content
        const contentMatch = entryContent.match(/<content[^>]*>([\s\S]*?)<\/content>/);
        const content = contentMatch ? contentMatch[1].trim() : "";
        
        // Extract link
        const linkMatch = entryContent.match(/<link[^>]*href="([^"]*)"[^>]*\/>/);
        const link = linkMatch ? linkMatch[1] : "";
        
        entries.push({ title, published, content, link });
      }
      
      if (entries.length === 0) {
        await interaction.editReply({
          content: "✅ No recent incidents found. VRChat services appear to be operating normally.",
        });
        return;
      }

      // Get feed update time
      const feedUpdatedMatch = atomContent.match(/<updated[^>]*>(.*?)<\/updated>/);
      const feedUpdated = feedUpdatedMatch ? feedUpdatedMatch[1].trim() : null;

      // Create embed
      const embed = new EmbedBuilder()
        .setTitle("🔧 VRChat Service Status")
        .setColor(0x1e3c72)
        .setURL("https://status.vrchat.com")
        .setTimestamp()
        .setFooter({ 
          text: "Data from status.vrchat.com",
          iconURL: "https://assets.vrchat.com/www/brand/logos/logo-vrchat-white-transparent-crop-1024.png"
        });

      if (feedUpdated) {
        embed.setDescription(`*Last updated: ${new Date(feedUpdated).toLocaleString()}*`);
      }

      // Process each entry
      for (const entry of entries) {
        // Parse the HTML content to extract the latest status update
        let latestUpdate = "No details available.";
        let statusType = "Update";
        
        // Extract the most recent update (first <p> tag with <strong>)
        const updateMatch = entry.content.match(/<p[^>]*>[\s\S]*?<strong[^>]*>(.*?)<\/strong>([\s\S]*?)<\/p>/);
        if (updateMatch) {
          statusType = updateMatch[1].trim();
          let updateText = updateMatch[2].trim();
          
          // Clean up the update text - remove HTML tags and extract meaningful content
          updateText = updateText.replace(/<[^>]*>/g, ""); // Remove HTML tags
          updateText = updateText.replace(/\s+/g, " ").trim(); // Normalize whitespace
          
          // Remove timestamp patterns at the beginning
          updateText = updateText.replace(/^[A-Z][a-z]{2}\s+\d{1,2},\s+\d{2}:\d{2}\s+UTC\s*-?\s*/, "");
          
          if (updateText.length > 0) {
            latestUpdate = updateText;
          }
        } else {
          // Fallback: just get first text from content
          const textMatch = entry.content.match(/>([^<]+)</);
          if (textMatch) {
            latestUpdate = textMatch[1].trim();
          }
        }

        // Determine status emoji
        let statusEmoji = "🔄";
        const statusLower = statusType.toLowerCase();
        if (statusLower.includes("resolved") || statusLower.includes("completed")) {
          statusEmoji = "✅";
        } else if (statusLower.includes("investigating") || statusLower.includes("identified")) {
          statusEmoji = "🔍";
        } else if (statusLower.includes("monitoring")) {
          statusEmoji = "👀";
        } else if (statusLower.includes("scheduled")) {
          statusEmoji = "📅";
        } else if (statusLower.includes("progress")) {
          statusEmoji = "⚙️";
        }

        // Format the date
        const dateStr = entry.published ? new Date(entry.published).toLocaleDateString() : "Unknown date";
        
        // Truncate content if too long
        if (latestUpdate.length > 200) {
          latestUpdate = latestUpdate.substring(0, 197) + "...";
        }

        const fieldName = `${statusEmoji} ${entry.title}`;
        const fieldValue = `**${statusType}** - ${latestUpdate}\n*${dateStr}*${entry.link ? ` • [View Details](${entry.link})` : ""}`;

        embed.addFields({
          name: fieldName,
          value: fieldValue,
          inline: false,
        });
      }

      // Overall status indicator based on the first (most recent) entry
      const firstEntry = entries[0];
      const hasActiveIssues = firstEntry.content.toLowerCase().includes("investigating") || 
                             firstEntry.content.toLowerCase().includes("identified") ||
                             firstEntry.content.toLowerCase().includes("progress") ||
                             firstEntry.title.toLowerCase().includes("issues") ||
                             firstEntry.title.toLowerCase().includes("outage") ||
                             firstEntry.title.toLowerCase().includes("maintenance");

      if (hasActiveIssues) {
        embed.setColor(0xff6b6b); // Red for active issues
        embed.setTitle("⚠️ VRChat Service Status - Issues Detected");
      } else {
        embed.setColor(0x51cf66); // Green for resolved/stable
        embed.setTitle("✅ VRChat Service Status - Services Operational");
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error("[VRChat Status Command] Error:", error);
      await interaction.editReply({
        content: "❌ An error occurred while fetching VRChat status. Please try again later.",
      });
    }
  }
}