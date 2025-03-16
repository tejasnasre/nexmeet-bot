import "dotenv/config";
import TelegramBot from "node-telegram-bot-api";
import { createClient } from "@supabase/supabase-js";
import MistralClient from "@mistralai/mistralai";
import express from "express";
import rateLimit from "express-rate-limit";
import moment from "moment";
import cors from "cors";
import eventRoutes from "./routes/events.js";
import systemRoutes from "./routes/system.js";
import { errorHandler } from "./middleware/errorHandler.js";

// Ensure environment variables are loaded
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  throw new Error(
    "Missing required environment variables: SUPABASE_URL or SUPABASE_KEY"
  );
}

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Initialize Mistral AI client
const mistral = new MistralClient(process.env.MISTRAL_API_KEY);

// Initialize Telegram Bot
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Initialize Express app with rate limiting
const app = express();

// Middleware
app.use(express.json());
app.use(cors());

const limiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 5, // 5 requests per day
  message: "Too many requests, please try again tomorrow",
  keyGenerator: (req) => {
    // Use chat ID as the key for rate limiting
    return req.body?.message?.chat?.id || req.ip;
  },
  skip: (req) => {
    // Skip rate limiting if we can't identify the user
    return !req.body?.message?.chat?.id && !req.ip;
  },
});

app.use("/api", limiter);

// Routes
app.use("/api/events", eventRoutes);
app.use("/api/system", systemRoutes);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Error handling
app.use(errorHandler);

// User session storage
const userSessions = new Map();

// Keyboard markup for main menu
const mainMenuKeyboard = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: "🎯 Active Hackathons", callback_data: "active_hackathons" },
        { text: "📜 Past Events", callback_data: "past_events" },
      ],
      [
        { text: "🌍 Search by Location", callback_data: "search_location" },
        { text: "🏷️ Search by Category", callback_data: "search_category" },
      ],
      [{ text: "📊 Most Popular Events", callback_data: "popular_events" }],
    ],
  },
};

// Start command handler
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const welcomeMessage = `
Welcome to the Event Bot! 🎉

I can help you discover amazing events and hackathons. Here's what you can do:

• Browse active hackathons
• View past events
• Search events by location
• Filter by category
• See popular events

Please select an option from the menu below:
`;

  try {
    await bot.sendMessage(chatId, welcomeMessage, mainMenuKeyboard);
  } catch (error) {
    console.error("Error sending welcome message:", error);
    await bot.sendMessage(
      chatId,
      "Sorry, there was an error showing the menu. Please try /start again."
    );
  }
});

// About command handler
bot.onText(/\/about/, async (msg) => {
  const chatId = msg.chat.id;
  const aboutMessage = `
🌟 *Welcome to NexMeet Bot* 🌟

*What's NexMeet?*
NexMeet is your go-to platform for organizing and discovering college and social events. We make event planning fun and hassle-free!

🎯 *Our Mission*
"What's cooler than Networking? Nothing dude." We believe in bringing people together and creating meaningful connections.

🤖 *Why Use NexMeet Bot?*
• Instant access to events right in Telegram
• Save time browsing - get event updates directly
• AI-powered personalized recommendations
• Real-time notifications for new events

✨ *Platform Features*:
• Event Space Discovery
• Multi-category Event Support
• Networking Opportunities
• Personal Growth Tracking
• Registration & Ticket Management
• Selective Invitation System

💡 *Bot Commands*:
1. /start - Open main menu
2. /about - Learn about NexMeet
3. /ask - AI-powered event search

🤝 *Community Partners*:
• Lamit Club
• Delhi NCR DAO
• DevSource
• DevLearn

🌐 *Website*: www.nexmeet.social

Join our vibrant community of event organizers and attendees. Whether you're hosting a technical workshop or looking for creative meetups, NexMeet has you covered!
`;

  try {
    await bot.sendMessage(chatId, aboutMessage, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Error sending about message:", error);
    await bot.sendMessage(
      chatId,
      "Sorry, there was an error showing the about information. Please try again."
    );
  }
});

// Handle callback queries from inline keyboard
bot.on("callback_query", async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const action = callbackQuery.data;

  try {
    // Acknowledge the callback query
    await bot.answerCallbackQuery(callbackQuery.id);

    switch (action) {
      case "active_hackathons":
        await bot.sendMessage(chatId, "🔍 Searching for active hackathons...");
        await handleActiveHackathons(chatId);
        break;
      case "past_events":
        await bot.sendMessage(chatId, "🔍 Fetching past events...");
        await handlePastEvents(chatId);
        break;
      case "search_location":
        userSessions.set(chatId, { state: "AWAITING_LOCATION" });
        await bot.sendMessage(
          chatId,
          "📍 Please enter the location you want to search for:"
        );
        break;
      case "search_category":
        userSessions.set(chatId, { state: "AWAITING_CATEGORY" });
        await bot.sendMessage(
          chatId,
          "🏷️ Please enter the category you want to search for:"
        );
        break;
      case "popular_events":
        await bot.sendMessage(chatId, "🔍 Finding the most popular events...");
        await handlePopularEvents(chatId);
        break;
    }
  } catch (error) {
    console.error("Error handling callback query:", error);
    await bot.sendMessage(
      chatId,
      "Sorry, there was an error processing your selection. Please try again."
    );
  }
});

// Helper function for active hackathons
async function handleActiveHackathons(chatId) {
  try {
    const currentDate = new Date().toISOString();
    const { data: events, error } = await supabase
      .from("event_details")
      .select("*")
      .gt("event_enddate", currentDate)
      .eq("is_approved", true)
      .order("created_at", { ascending: false });

    if (error) throw error;

    if (events.length === 0) {
      await bot.sendMessage(
        chatId,
        "No active hackathons found at the moment."
      );
      return;
    }

    for (const event of events) {
      const message = formatEventMessage(event);
      await bot.sendMessage(chatId, message, { parse_mode: "HTML" });
    }
  } catch (error) {
    console.error("Error fetching active hackathons:", error);
    await bot.sendMessage(
      chatId,
      "Sorry, there was an error fetching the events. Please try again later."
    );
  }
}

// Helper function for past events
async function handlePastEvents(chatId) {
  try {
    const currentDate = new Date().toISOString();
    const { data: events, error } = await supabase
      .from("event_details")
      .select("*")
      .lt("event_enddate", currentDate)
      .eq("is_approved", true)
      .order("event_enddate", { ascending: false })
      .limit(5);

    if (error) throw error;

    if (events.length === 0) {
      await bot.sendMessage(chatId, "No past events found.");
      return;
    }

    for (const event of events) {
      const message = formatEventMessage(event);
      await bot.sendMessage(chatId, message, { parse_mode: "HTML" });
    }
  } catch (error) {
    console.error("Error fetching past events:", error);
    await bot.sendMessage(
      chatId,
      "Sorry, there was an error fetching the events. Please try again later."
    );
  }
}

// Helper function for popular events
async function handlePopularEvents(chatId) {
  try {
    const { data: events, error } = await supabase
      .from("event_details")
      .select("*")
      .eq("is_approved", true)
      .order("event_likes", { ascending: false })
      .limit(5);

    if (error) throw error;

    if (events.length === 0) {
      await bot.sendMessage(chatId, "No events found.");
      return;
    }

    for (const event of events) {
      const message = formatEventMessage(event);
      await bot.sendMessage(chatId, message, { parse_mode: "HTML" });
    }
  } catch (error) {
    console.error("Error fetching popular events:", error);
    await bot.sendMessage(
      chatId,
      "Sorry, there was an error fetching the events. Please try again later."
    );
  }
}

// Handle text messages (for location and category searches)
bot.on("text", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const session = userSessions.get(chatId);

  if (!session) return;

  try {
    if (session.state === "AWAITING_LOCATION") {
      await bot.sendMessage(chatId, `🔍 Searching for events in ${text}...`);
      const { data: events, error } = await supabase
        .from("event_details")
        .select("*")
        .ilike("event_location", `%${text}%`)
        .eq("is_approved", true);

      if (error) throw error;

      if (events.length === 0) {
        await bot.sendMessage(chatId, `📭 No events found in ${text}`);
      } else {
        await bot.sendMessage(
          chatId,
          `📍 Found ${events.length} events in ${text}:`
        );
        for (const event of events) {
          const message = formatEventMessage(event);
          await bot.sendMessage(chatId, message, { parse_mode: "HTML" });
        }
      }
      userSessions.delete(chatId);
    } else if (session.state === "AWAITING_CATEGORY") {
      await bot.sendMessage(
        chatId,
        `🔍 Searching for events in category ${text}...`
      );
      const { data: events, error } = await supabase
        .from("event_details")
        .select("*")
        .ilike("event_category", `%${text}%`)
        .eq("is_approved", true);

      if (error) throw error;

      if (events.length === 0) {
        await bot.sendMessage(chatId, `📭 No events found in category ${text}`);
      } else {
        await bot.sendMessage(
          chatId,
          `🏷️ Found ${events.length} events in category ${text}:`
        );
        for (const event of events) {
          const message = formatEventMessage(event);
          await bot.sendMessage(chatId, message, { parse_mode: "HTML" });
        }
      }
      userSessions.delete(chatId);
    }
  } catch (error) {
    console.error("Error processing text message:", error);
    await bot.sendMessage(
      chatId,
      "Sorry, there was an error processing your request. Please try again later."
    );
    userSessions.delete(chatId);
  }
});

// AI agent handler for complex queries
bot.onText(/\/ask (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const query = match[1];

  try {
    await bot.sendMessage(chatId, "🤖 Processing your request with AI...");

    // Use Mistral AI to understand the query
    const response = await mistral.chat({
      model: process.env.MISTRAL_MODEL_NAME,
      messages: [
        {
          role: "user",
          content: `Given this event query: "${query}", help me understand what kind of events the user is looking for. Consider factors like timing, category, and location.`,
        },
      ],
    });

    const aiResponse = response.choices[0].message.content;
    await bot.sendMessage(chatId, "🔍 Searching for matching events...");

    // Use the AI response to query the database
    const { data: events, error } = await supabase
      .from("event_details")
      .select("*")
      .eq("is_approved", true)
      .textSearch("event_description", query)
      .limit(5);

    if (error) throw error;

    if (events.length === 0) {
      await bot.sendMessage(
        chatId,
        "📭 I couldn't find any events matching your criteria."
      );
    } else {
      await bot.sendMessage(
        chatId,
        `✨ Found ${events.length} events that might interest you:`
      );
      for (const event of events) {
        const message = formatEventMessage(event);
        await bot.sendMessage(chatId, message, { parse_mode: "HTML" });
      }
    }
  } catch (error) {
    console.error("Error processing AI query:", error);
    await bot.sendMessage(
      chatId,
      "Sorry, I couldn't process your request right now. Please try again later."
    );
  }
});

// Helper function to format event messages
function formatEventMessage(event) {
  return `
<b>${event.event_title}</b>

📝 <b>Description:</b> ${event.event_description}
📍 <b>Location:</b> ${event.event_location}
📅 <b>Start Date:</b> ${moment(event.event_startdate).format(
    "MMMM Do YYYY, h:mm a"
  )}
⏳ <b>Duration:</b> ${event.event_duration} hours
👥 <b>Team Size:</b> ${event.team_size}
💰 <b>Price:</b> ${event.isEventFree ? "Free" : `₹${event.event_price}`}

<b>Registration:</b>
• Start: ${moment(event.event_registration_startdate).format("MMMM Do YYYY")}
• End: ${moment(event.event_registration_enddate).format("MMMM Do YYYY")}
${event.redirection_link ? `• Register: ${event.redirection_link}` : ""}

<b>Organizer Details:</b>
• Name: ${event.organizer_name}
• Email: ${event.organizer_email}
• Contact: ${event.organizer_contact}

🏷️ <b>Category:</b> ${event.event_category}
❤️ <b>Likes:</b> ${event.event_likes}

🔗 <b>Event Link:</b> https://www.nexmeet.social/explore-events/${event.id}
`;
}

// Start the server
const PORT = process.env.PORT || 4040;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
