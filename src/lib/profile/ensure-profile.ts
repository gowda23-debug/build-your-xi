import type { User } from "@supabase/supabase-js";

import { supabaseAdmin } from "@/lib/supabase/admin";

function buildFallbackGamerTag(
    user: User
) {
    const metadataGamerTag =
        typeof user.user_metadata?.gamer_tag ===
        "string"
            ? user.user_metadata.gamer_tag.trim()
            : "";

    if (
        /^[A-Za-z0-9_]{3,20}$/.test(
            metadataGamerTag
        )
    ) {
        return metadataGamerTag;
    }

    const metadataDisplayName =
        typeof user.user_metadata?.display_name ===
        "string"
            ? user.user_metadata.display_name.trim()
            : "";

    const cleanedDisplayName =
        metadataDisplayName
            .replace(
                /[^A-Za-z0-9_]/g,
                "_"
            )
            .replace(
                /_+/g,
                "_"
            )
            .replace(
                /^_+|_+$/g,
                ""
            )
            .slice(0, 16);

    if (
        cleanedDisplayName.length >= 3
    ) {
        return `${cleanedDisplayName}_${user.id
            .replace(/-/g, "")
            .slice(0, 3)}`.slice(
            0,
            20
        );
    }

    return `PLAYER_${user.id
        .replace(/-/g, "")
        .slice(0, 10)}`.slice(
        0,
        20
    );
}

export async function ensureProfile(
    user: User
) {
    /*
     * First check whether the profile already exists.
     */

    const {
        data: existingProfile,
        error: lookupError,
    } = await supabaseAdmin
        .from("profiles")
        .select(
            "id, display_name, gamer_tag, email"
        )
        .eq(
            "id",
            user.id
        )
        .maybeSingle();

    if (lookupError) {
        throw new Error(
            `Unable to verify player profile: ${lookupError.message}`
        );
    }

    if (existingProfile) {
        return existingProfile;
    }

    /*
     * No profile exists.
     *
     * Create one server-side.
     */

    const displayName =
        typeof user.user_metadata?.display_name ===
        "string" &&
        user.user_metadata.display_name.trim()
            ? user.user_metadata.display_name.trim()
            : "PLAYER";

    const gamerTag =
        buildFallbackGamerTag(
            user
        );

    const {
        data: createdProfile,
        error: createError,
    } = await supabaseAdmin
        .from("profiles")
        .insert({
            id: user.id,
            display_name:
                displayName,
            gamer_tag:
                gamerTag,
            email:
                user.email ?? "",
            updated_at:
                new Date().toISOString(),
        })
        .select(
            "id, display_name, gamer_tag, email"
        )
        .single();

    if (createError) {
        /*
         * Another request may have created
         * the profile at the same time.
         *
         * Re-read it before failing.
         */

        const {
            data: concurrentProfile,
            error:
                concurrentLookupError,
        } = await supabaseAdmin
            .from("profiles")
            .select(
                "id, display_name, gamer_tag, email"
            )
            .eq(
                "id",
                user.id
            )
            .maybeSingle();

        if (
            concurrentLookupError ||
            !concurrentProfile
        ) {
            throw new Error(
                `Unable to create player profile: ${createError.message}`
            );
        }

        return concurrentProfile;
    }

    return createdProfile;
}