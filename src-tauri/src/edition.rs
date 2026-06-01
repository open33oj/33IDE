pub const EDITION: &str = if cfg!(feature = "ultimate") {
    "ultimate"
} else if cfg!(feature = "advanced") {
    "advanced"
} else {
    "basic"
};

pub const HAS_CPH: bool = cfg!(feature = "cph");
pub const HAS_BROWSER: bool = cfg!(feature = "browser");
pub const HAS_AI_TRANSLATE: bool = cfg!(feature = "ai_translate");
pub const HAS_AI_SUGGEST: bool = cfg!(feature = "ai_suggest");
