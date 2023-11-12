import { clearSearchBar, getPreferenceValues, showToast, Toast } from "@raycast/api";
import { useCallback, useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { Chat, ChatHook, ImageSize, Model } from "../type";
import { getConfiguration, useChatGPT } from "./useChatGPT";
import { useProxy } from "./useProxy";

export function useImageChat<T extends Chat>(props: T[]): ChatHook {
  const [data, setData] = useState<Chat[]>(props);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [isLoading, setLoading] = useState<boolean>(false);
  const [streamData] = useState<Chat | undefined>(undefined);

  const proxy = useProxy();
  const chatGPT = useChatGPT();

  const [useImageSize] = useState<ImageSize>(() => {
    return getPreferenceValues<{
      imageSize: ImageSize;
    }>().imageSize;
  });

  // TODO: Use `model` once we update to the latest version of the API
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function ask(question: string, model: Model) {
    clearSearchBar();

    setLoading(true);
    const toast = await showToast({
      title: "Getting your image...",
      style: Toast.Style.Animated,
    });

    const chat: Chat = {
      id: uuidv4(),
      question,
      answer: "",
      created_at: new Date().toISOString(),
    };

    setData((prev) => {
      return [...prev, chat];
    });

    setTimeout(async () => {
      setSelectedChatId(chat.id);
    }, 50);

    const getHeaders = function () {
      const config = getConfiguration();
      if (!config.useAzure) {
        return { apiKey: "", params: {} };
      }
      return {
        apiKey: config.apiKey,
        params: { "api-version": "2023-03-15-preview" },
      };
    };

    await chatGPT
      .createImage(
        {
          prompt: question,
          response_format: "url",
          n: 1, // TODO: Make this configurable
          size: useImageSize,
        },
        {
          responseType: undefined,
          headers: { "api-key": getHeaders().apiKey },
          params: getHeaders().params,
          proxy: proxy,
        }
      )
      .then(async (res) => {
        for (const line of res.data.data) chat.answer += `![${question}](${line.url})\n`;

        setLoading(false);

        toast.title = "Got your answer!";
        toast.style = Toast.Style.Success;

        setData((prev) => prev.map((a) => (a.id === chat.id ? chat : a)));
      })
      .catch((err) => {
        if (err?.message) {
          if (err.message.includes("429")) {
            toast.title = "You've reached your API limit";
            toast.message = "Please upgrade to pay-as-you-go";
          } else {
            toast.title = "Error";
            toast.message = err.message;
          }
        }
        toast.style = Toast.Style.Failure;
        setLoading(false);
      });
  }

  const clear = useCallback(async () => {
    setData([]);
  }, [setData]);

  return useMemo(
    () => ({ data, setData, isLoading, setLoading, selectedChatId, setSelectedChatId, ask, clear, streamData }),
    [data, setData, isLoading, setLoading, selectedChatId, setSelectedChatId, ask, clear, streamData]
  );
}
