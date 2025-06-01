import { Discord, Slash, SlashOption, SlashGroup, Guild, Guard } from "discordx";
import { CommandInteraction, ApplicationCommandOptionType, MessageFlags, EmbedBuilder, Colors, AutocompleteInteraction, CategoryChannel, ChannelType, TextDisplayBuilder, ContainerBuilder, SectionBuilder, ButtonBuilder, ButtonStyle, MediaGalleryBuilder } from "discord.js";
import { config } from "dotenv";
import { VRChatLoginGuard } from "../../utility/guards.js";
import { getUserById, searchUsers } from "../../utility/vrchat.js";


config();

@Discord()

@SlashGroup({ name: "vrchat", description: "VRChat related commands." })
@SlashGroup("vrchat")
@Guard(VRChatLoginGuard)
export default class VRChatCommands {
    @Slash({
        name: "verify",
        description: "Start the verification process."
    })
    async verify(
        @SlashOption({
            name: "vrc_user",
            description: "Search for your VRChat username or user ID",
            type: ApplicationCommandOptionType.String,
            required: true,
            autocomplete: true
        }) vrchatUser: string,
        interaction: CommandInteraction | AutocompleteInteraction
    ) {

        if (interaction.isAutocomplete()) {
            return this.autocompleteVerifyVrchatUser(interaction);
        }

        if (!interaction.isCommand()) {
            return;
        }


        const userIdOpt = interaction.options.get("vrc_user", true);
        const userId = typeof userIdOpt === "string" ? userIdOpt : userIdOpt?.value;
        if (!userId || typeof userId !== "string") {
            await interaction.reply({
                content: `No VRChat user ID provided. Please try again.`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        // Fetch user details from VRChat API using the userId directly
        let userInfo: any = null;
        try {
            userInfo = await getUserById(userId);
        } catch (e) {
            userInfo = null;
        }
        if (!userInfo) {
            await interaction.reply({
                content: `Could not fetch VRChat user details. Please try again or check the user ID.`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        const embed = new EmbedBuilder()
            .setTitle(`Is this your VRChat account?`)
            .setDescription(`**${userInfo.displayName}** (${userInfo.id})\nIs this the correct account?`)
            .setColor(Colors.Blue)
            .setImage(userInfo.profilePicOverride || userInfo.currentAvatarImageUrl || userInfo.currentAvatarThumbnailImageUrl || null)
            .setThumbnail(userInfo.userIcon || userInfo.profilePicOverride || null)
            .setFooter({ text: "VRChat Verification" });

        // Use the discord and VRChat IDs in the confirm button's custom_id
        const confirmBtn = new ButtonBuilder()
            .setCustomId(`vrchat-verify:${interaction.user.id}:${userInfo.id}`)
            .setLabel("Confirm account")
            .setStyle(ButtonStyle.Success);
        const tryAgainBtn = new ButtonBuilder()
            .setCustomId("vrchat-verify-try-again")
            .setLabel("Try again")
            .setStyle(ButtonStyle.Secondary);
        const row = { type: 1, components: [confirmBtn, tryAgainBtn] };
        await interaction.reply({
            embeds: [embed],
            components: [row],
            flags: MessageFlags.Ephemeral
        });
    }

    async autocompleteVerifyVrchatUser(interaction: AutocompleteInteraction) {
        const query = interaction.options.getFocused();
        if (!query || query.length < 2) {
            return await interaction.respond([]);;
        }
        try {
            const users = await searchUsers({ search: query, n: 25 });
            const choices = users.map((user: any) => ({
                name: `${user.displayName} (${user.id})`,
                value: user.id
            }));
            return await interaction.respond(choices);
        } catch (e) {
            return await interaction.respond([]);
        }
    }

}
