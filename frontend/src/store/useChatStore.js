import { create } from "zustand";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "./useAuthStore";

export const useChatStore = create((set, get) => ({
  messages: {}, // store messages per userId
  users: [],
  selectedUser: null,
  unreadMessages: {}, // <-- NEW: track unread counts by userId
  isUsersLoading: false,
  isMessagesLoading: false,
  _isSubscribed: false, // private flag to avoid multiple socket listeners

  getUsers: async () => {
    set({ isUsersLoading: true });
    try {
      const res = await axiosInstance.get("/messages/users");
      set({ users: res.data });
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to fetch users");
    } finally {
      set({ isUsersLoading: false });
    }
  },

  getMessages: async (userId) => {
    set({ isMessagesLoading: true });
    try {
      const res = await axiosInstance.get(`/messages/${userId}`);
      set((state) => ({
        messages: {
          ...state.messages,
          [userId]: res.data,
        },
        unreadMessages: {
          ...state.unreadMessages,
          [userId]: 0,  // <-- Clear unread count when loading messages for this user
        },
      }));
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to fetch messages");
    } finally {
      set({ isMessagesLoading: false });
    }
  },

  sendMessage: async (messageData) => {
    const { selectedUser } = get();
    if (!selectedUser) return;

    try {
      const res = await axiosInstance.post(`/messages/send/${selectedUser._id}`, messageData);
      const newMessage = res.data;

      set((state) => {
        const userId = selectedUser._id;
        const existingMessages = state.messages[userId] || [];

        if (existingMessages.some(msg => msg._id === newMessage._id)) {
          return {};
        }

        return {
          messages: {
            ...state.messages,
            [userId]: [...existingMessages, newMessage],
          },
        };
      });

      const socket = useAuthStore.getState().socket;
      if (socket) {
        const currentUserId = useAuthStore.getState().authUser._id;
        socket.emit("sendMessage", {
          receiverId: selectedUser._id,
          senderId: currentUserId,
          text: messageData.text,
          image: messageData.image || null,
        });
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to send message");
    }
  },

  subscribeToMessages: () => {
    if (get()._isSubscribed) return; // prevent multiple subscriptions

    const socket = useAuthStore.getState().socket;
    if (!socket) return;

    socket.on("newMessage", (newMessage) => {
      const currentUserId = useAuthStore.getState().authUser._id;
      const selectedUser = get().selectedUser;
      const otherUserId =
        newMessage.senderId === currentUserId
          ? newMessage.receiverId
          : newMessage.senderId;

      // Show toast only if new message is NOT from the selected user
      if (!selectedUser || selectedUser._id !== newMessage.senderId) {
        toast.success("📩 New message received!");

        // Increment unread count for that user
        set((state) => ({
          unreadMessages: {
            ...state.unreadMessages,
            [otherUserId]: (state.unreadMessages[otherUserId] || 0) + 1,
          },
        }));
      }

      // Add message to store
      set((state) => {
        const existing = state.messages[otherUserId] || [];

        // Avoid duplicate messages
        if (existing.some((msg) => msg._id === newMessage._id)) {
          return {};
        }

        return {
          messages: {
            ...state.messages,
            [otherUserId]: [...existing, newMessage],
          },
        };
      });
    });

    set({ _isSubscribed: true });
  },

  unsubscribeFromMessages: () => {
    const socket = useAuthStore.getState().socket;
    if (socket) {
      socket.off("newMessage");
    }
    set({ _isSubscribed: false });
  },

  setSelectedUser: (selectedUser) => {
    // Clear unread count when user is selected
    set((state) => ({
      selectedUser,
      unreadMessages: {
        ...state.unreadMessages,
        [selectedUser?._id]: 0,
      },
    }));
  },
}));
