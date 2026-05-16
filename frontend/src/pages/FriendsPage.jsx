import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import { getUserFriends } from "../lib/api";
import { Search, X, MessageCircle, Video } from "lucide-react";
import { capitialize } from "../lib/utils";
import NoFriendsFound from "../components/NoFriendsFound";
import { useChatContext } from "../context/ChatContext";
import { getLanguageFlag } from "../components/FriendCard";
import {
  Channel,
  Chat,
  MessageInput,
  MessageList,
  Thread,
  Window,
} from "stream-chat-react";
import toast from "react-hot-toast";

const FriendsPage = () => {
  const [search, setSearch] = useState("");
  const [channelMap, setChannelMap] = useState({});
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [activeChannel, setActiveChannel] = useState(null);
  const [loadingChannel, setLoadingChannel] = useState(false);

  const { client: chatClient, markAsRead } = useChatContext();

  const { data: friends = [], isLoading } = useQuery({
    queryKey: ["friends"],
    queryFn: getUserFriends,
  });

  useEffect(() => {
    if (!chatClient?.userID) return;

    const fetchChannels = async () => {
      try {
        const channels = await chatClient.queryChannels(
          { members: { $in: [chatClient.userID] } },
          [{ last_message_at: -1 }],
          { watch: true, state: true, limit: 50 }
        );

        const map = {};
        channels.forEach((ch) => {
          if (ch.data?.isGroupRoom) return;
          const otherMember = Object.values(ch.state.members || {}).find(
            (m) => m.user?.id !== chatClient.userID
          );
          if (!otherMember) return;

          const unread = ch.state?.membership?.unread_count ?? ch.countUnread();
          const lastMsg = ch.state?.messages?.slice(-1)[0];
          const lastTime = lastMsg?.created_at
            ? new Date(lastMsg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            : "";

          map[otherMember.user.id] = {
            unreadCount: unread,
            lastMessage: lastMsg?.text || (lastMsg ? "Sent an attachment" : ""),
            lastTime,
          };
        });

        setChannelMap(map);
      } catch (err) {
        console.error("Failed to load friend channels:", err);
      }
    };

    fetchChannels();
    const handler = () => fetchChannels();
    chatClient.on("message.new", handler);
    chatClient.on("notification.message_new", handler);
    chatClient.on("channel.read", handler);
    return () => {
      chatClient.off("message.new", handler);
      chatClient.off("notification.message_new", handler);
      chatClient.off("channel.read", handler);
    };
  }, [chatClient]);

  const openChat = async (friend) => {
    if (!chatClient || !friend) return;
    setSelectedFriend(friend);
    setLoadingChannel(true);
    try {
      const myId = chatClient.userID;
      const channelId = [myId, friend._id].sort().join("-");
      const ch = chatClient.channel("messaging", channelId, { members: [myId, friend._id] });
      await ch.watch();
      await ch.markRead();
      markAsRead();
      setActiveChannel(ch);
      setChannelMap((prev) => ({
        ...prev,
        [friend._id]: { ...(prev[friend._id] || {}), unreadCount: 0 },
      }));
    } catch (err) {
      toast.error("Could not open chat.");
    } finally {
      setLoadingChannel(false);
    }
  };

  const handleVideoCall = () => {
    if (!activeChannel) return;
    const callUrl = `${window.location.origin}/call/${activeChannel.id}`;
    activeChannel.sendMessage({ text: `I've started a video call. Join me here: ${callUrl}` });
    toast.success("Video call link sent!");
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const list = friends.filter((f) =>
      !q ||
      f.fullName.toLowerCase().includes(q) ||
      f.nativeLanguage?.toLowerCase().includes(q) ||
      f.learningLanguage?.toLowerCase().includes(q)
    );
    return [...list].sort((a, b) => {
      const aU = channelMap[a._id]?.unreadCount || 0;
      const bU = channelMap[b._id]?.unreadCount || 0;
      if (bU !== aU) return bU - aU;
      return (channelMap[b._id]?.lastMessage ? 1 : 0) - (channelMap[a._id]?.lastMessage ? 1 : 0);
    });
  }, [friends, search, channelMap]);

  return (
    <>
      <style>{`
        /* Force Stream chat to fill its container with dark theme */
        .str-chat, .str-chat__container { height: 100% !important; }
        .str-chat__main-panel { height: 100% !important; }
        .str-chat-channel { height: 100% !important; }

        .str-chat,
        .str-chat__container,
        .str-chat-channel,
        .str-chat__main-panel,
        .str-chat__message-list-scroll,
        .str-chat__list,
        .str-chat__virtual-list,
        .str-chat__message-list,
        .str-chat__thread,
        .str-chat__input-flat,
        .str-chat__message-input {
          background: hsl(var(--b1)) !important;
          color: hsl(var(--bc)) !important;
        }
        .str-chat__date-separator-line {
          background: hsl(var(--b3)) !important;
        }
        .str-chat__date-separator-date {
          background: hsl(var(--b1)) !important;
          color: hsl(var(--bc) / 0.5) !important;
        }
        .str-chat__message-text-inner {
          background: hsl(var(--b2)) !important;
          color: hsl(var(--bc)) !important;
        }
        .str-chat__message--me .str-chat__message-text-inner {
          background: hsl(var(--p)) !important;
          color: hsl(var(--pc)) !important;
        }
        .str-chat__message-input-inner,
        .str-chat__textarea > textarea {
          background: hsl(var(--b2)) !important;
          color: hsl(var(--bc)) !important;
        }
        .str-chat__message-attachment--card {
          background: hsl(var(--b2)) !important;
        }
      `}</style>

      <div className="flex overflow-hidden" style={{ height: "calc(100vh - 64px)" }}>

        {/* ── LEFT: Friends List ── */}
        <div className={`
          flex flex-col border-r border-base-300 shrink-0 w-72
          ${selectedFriend ? "hidden lg:flex" : "flex w-full lg:w-72"}
        `}>
          {/* Header */}
          <div className="px-3 pt-4 pb-2 border-b border-base-300/50 space-y-2">
            <h1 className="text-base font-bold px-1">
              Friends
              <span className="text-xs font-normal opacity-40 ml-2">{friends.length}</span>
            </h1>
            <label className="input input-bordered input-xs flex items-center gap-2 w-full">
              <Search className="size-3 opacity-40 shrink-0" />
              <input
                type="text"
                placeholder="Search…"
                className="grow bg-transparent outline-none text-xs"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button onClick={() => setSearch("")} className="opacity-40 hover:opacity-100">
                  <X className="size-2.5" />
                </button>
              )}
            </label>
          </div>

          {/* Rows */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex justify-center py-10">
                <span className="loading loading-spinner loading-sm" />
              </div>
            ) : friends.length === 0 ? (
              <div className="p-4"><NoFriendsFound /></div>
            ) : filtered.length === 0 ? (
              <div className="p-4 text-center text-xs opacity-40">No friends match</div>
            ) : (
              <div>
                {filtered.map((friend) => {
                  const info = channelMap[friend._id] || {};
                  const isActive = selectedFriend?._id === friend._id;

                  return (
                    <button
                      key={friend._id}
                      onClick={() => openChat(friend)}
                      className={`
                        w-full flex items-center gap-2.5 px-3 py-2 text-left
                        border-l-2 transition-colors duration-100
                        ${isActive
                          ? "bg-primary/10 border-primary"
                          : "hover:bg-base-300/40 border-transparent"
                        }
                      `}
                    >
                      <div className="relative shrink-0">
                        <img
                          src={friend.profilePic || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend._id}`}
                          alt={friend.fullName}
                          className="size-9 rounded-full object-cover bg-base-300"
                        />
                        {info.unreadCount > 0 && (
                          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] flex items-center justify-center bg-primary text-primary-content text-[9px] font-bold rounded-full px-0.5">
                            {info.unreadCount > 99 ? "99+" : info.unreadCount}
                          </span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <p className={`text-xs truncate ${info.unreadCount > 0 ? "font-bold" : "font-medium opacity-80"}`}>
                            {friend.fullName}
                          </p>
                          {info.lastTime && (
                            <span className={`text-[9px] shrink-0 ${info.unreadCount > 0 ? "text-primary font-semibold" : "opacity-30"}`}>
                              {info.lastTime}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-1 mt-0.5">
                          <p className={`text-[10px] truncate ${info.unreadCount > 0 ? "opacity-70 font-medium" : "opacity-35"}`}>
                            {info.lastMessage || `${capitialize(friend.nativeLanguage || "")} → ${capitialize(friend.learningLanguage || "")}`}
                          </p>
                          <div className="flex items-center gap-0.5 shrink-0">
                            {getLanguageFlag(friend.nativeLanguage)}
                            <span className="text-[8px] opacity-20">→</span>
                            {getLanguageFlag(friend.learningLanguage)}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Chat Panel — fills full remaining height ── */}
        <div className={`flex-1 flex flex-col overflow-hidden ${selectedFriend ? "flex" : "hidden lg:flex"}`}>
          {!selectedFriend ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 select-none">
              <div className="size-16 rounded-full bg-base-200 flex items-center justify-center">
                <MessageCircle className="size-7 opacity-20" />
              </div>
              <p className="text-sm opacity-40 font-medium">Select a friend to start chatting</p>
            </div>
          ) : loadingChannel ? (
            <div className="flex-1 flex items-center justify-center">
              <span className="loading loading-spinner loading-lg" />
            </div>
          ) : activeChannel && chatClient ? (
            <Chat client={chatClient}>
              <Channel channel={activeChannel}>
                <Window hideOnThread>
                  {/* Custom header */}
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-base-300 bg-base-200 shrink-0">
                    <div className="flex items-center gap-3">
                      <img
                        src={selectedFriend.profilePic || `https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedFriend._id}`}
                        alt={selectedFriend.fullName}
                        className="size-8 rounded-full object-cover"
                      />
                      <div>
                        <p className="font-semibold text-sm leading-tight">{selectedFriend.fullName}</p>
                        <p className="text-xs opacity-40 leading-tight">
                          {capitialize(selectedFriend.nativeLanguage || "")} → {capitialize(selectedFriend.learningLanguage || "")}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={handleVideoCall}
                      className="btn btn-ghost btn-sm btn-circle"
                      title="Start video call"
                    >
                      <Video className="size-5" />
                    </button>
                  </div>
                  {/* MessageList fills all remaining space */}
                  <MessageList />
                  <MessageInput focus />
                </Window>
                <Thread />
              </Channel>
            </Chat>
          ) : null}
        </div>
      </div>
    </>
  );
};

export default FriendsPage;