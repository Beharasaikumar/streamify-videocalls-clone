import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router";
import useAuthUser from "../hooks/useAuthUser";
import { useChatContext } from "../context/ChatContext";

import {
  Channel,
  ChannelHeader,
  Chat,
  MessageInput,
  MessageList,
  Thread,
  Window,
} from "stream-chat-react";

import toast from "react-hot-toast";
import ChatLoader from "../components/ChatLoader";

const GroupChatPage = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();

  const { authUser, isLoading: authLoading } = useAuthUser();
  const { client } = useChatContext(); 

  const [channel, setChannel] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initChannel = async () => {
      if (!client || !authUser || !roomId) return;

      try {
        const currChannel = client.channel("messaging", roomId);

        await currChannel.watch();

        setChannel(currChannel);
      } catch (err) {
        console.error("Error joining group room:", err);
        toast.error("Could not join room.");
        navigate("/rooms");
      } finally {
        setLoading(false);
      }
    };

    initChannel();
  }, [client, authUser, roomId]);

  if (authLoading || loading || !client || !channel) {
    return <ChatLoader />;
  }

  return (
    <div className="h-[93vh]">
      <Chat client={client}>
        <Channel channel={channel}>
          <div className="w-full relative">
            <Window>
              <ChannelHeader />
              <MessageList />
              <MessageInput focus />
            </Window>
          </div>
          <Thread />
        </Channel>
      </Chat>
    </div>
  );
};

export default GroupChatPage;