import json
import asyncio
from typing import Optional, List, Dict, Any, AsyncGenerator, Tuple, Union
from types import SimpleNamespace

from dotenv import load_dotenv
from litellm import acompletion
from models.wikipedia_tool import search_wikipedia, get_wikipedia_tool_definition
from models.final_result_tool import (
    get_final_result_tool_definition,
    call_final_result_tool,
)
from system_prompts import RESEARCH_AGENT_PROMPT


load_dotenv()


def ensure_serializable(obj: Any) -> Any:
    """Ensure an object is JSON serializable by converting to basic Python types."""
    if hasattr(obj, "model_dump"):
        # Handle pydantic models or objects with model_dump
        return ensure_serializable(obj.model_dump())
    elif isinstance(obj, dict):
        # Recursively process dictionary values
        return {k: ensure_serializable(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        # Recursively process list items
        return [ensure_serializable(item) for item in obj]
    elif hasattr(obj, "__dict__") and not isinstance(
        obj, (str, int, float, bool, type(None))
    ):
        # Handle custom objects with __dict__
        return ensure_serializable(obj.__dict__)
    else:
        # Basic types should already be serializable
        return obj


class LiteLLMClient:
    """LiteLLM client."""

    def __init__(self):
        """Initialize LiteLLM client."""
        self.local_tools = [
            get_wikipedia_tool_definition(),
            get_final_result_tool_definition(),
        ]

    def _convert_tools_to_openai_format(self) -> List[Dict[str, Any]]:
        """Convert local tools to OpenAI function calling format"""
        openai_tools = []

        # Add local tools
        for tool in self.local_tools:
            openai_tool = {
                "type": "function",
                "function": {
                    "name": tool["name"],
                    "description": tool.get("description", ""),
                },
            }

            # Add parameters if they exist
            if "parameters" in tool:
                openai_tool["function"]["parameters"] = tool["parameters"]

            openai_tools.append(openai_tool)

        return openai_tools

    async def _call_local_tool(
        self, tool_name: str, arguments: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Handle local tool calls"""
        if tool_name == "wikipedia_search":
            query = arguments.get("query", "")
            limit = arguments.get("limit", 5)
            return await search_wikipedia(query, limit)
        elif tool_name == "final_result_tool":
            return await call_final_result_tool(arguments)
        else:
            raise ValueError(f"Unknown local tool: {tool_name}")

    async def chat_stream(
        self,
        chat_history: List[Dict[str, Any]],
        model: str = "gemini/gemini-2.5-pro",
    ) -> AsyncGenerator[Tuple[str, Union[str, List[Dict[str, Any]]]], None]:
        """Stream chat response with local tool integration"""

        model = "gemini/gemini-2.5-pro"

        # Get local tools and convert to OpenAI format
        openai_tools = self._convert_tools_to_openai_format()

        chat_messages = chat_history.copy()

        # Add system prompt if this is the first interaction or no system message exists
        has_system_message = any(msg.get("role") == "system" for msg in chat_messages)
        if not has_system_message:
            system_prompt = {
                "role": "system",
                "content": RESEARCH_AGENT_PROMPT,
            }
            chat_messages.insert(0, system_prompt)
        new_messages = []

        while True:
            try:
                # Initial streaming request
                stream = await acompletion(
                    model=model,
                    messages=chat_messages,
                    tools=openai_tools,
                    tool_choice="auto",
                    stream=True,
                    temperature=0.6,
                )

                full_response_text = ""
                tool_calls_data = []
                current_tool_calls = []

                async for chunk in stream:  # type: ignore
                    # Handle text content
                    if chunk.choices[0].delta.content:
                        content = chunk.choices[0].delta.content
                        full_response_text += content
                        yield "chunk", f"data: {json.dumps({'v': content})}\n\n"

                    # Handle tool calls
                    if chunk.choices[0].delta.tool_calls:
                        for tool_call_delta in chunk.choices[0].delta.tool_calls:
                            # Initialize tool call if it's the first chunk
                            while len(tool_calls_data) <= tool_call_delta.index:
                                tool_calls_data.append(
                                    {
                                        "id": "",
                                        "type": "function",
                                        "function": {"name": "", "arguments": ""},
                                    }
                                )

                            # Update tool call data
                            index = tool_call_delta.index
                            if tool_call_delta.id:
                                tool_calls_data[index]["id"] = tool_call_delta.id
                            if tool_call_delta.type:
                                tool_calls_data[index]["type"] = tool_call_delta.type
                            if tool_call_delta.function:
                                if tool_call_delta.function.name:
                                    tool_calls_data[index]["function"][
                                        "name"
                                    ] = tool_call_delta.function.name
                                if tool_call_delta.function.arguments:
                                    tool_calls_data[index]["function"][
                                        "arguments"
                                    ] += tool_call_delta.function.arguments

                # Create the assistant message with text content and/or tool calls
                assistant_message: Dict[str, Any] = {
                    "role": "assistant",
                    "content": full_response_text,
                }

                # Add tool calls if present
                if tool_calls_data:
                    assistant_message["tool_calls"] = tool_calls_data
                    current_tool_calls = tool_calls_data
                    # Yield tool call information as it's confirmed
                    for tc_data in tool_calls_data:
                        yield (
                            "tool_call",
                            f"data: {json.dumps({'tc': ensure_serializable(tc_data)})}\n\n",
                        )

                # Add to message history
                new_messages.append(assistant_message)
                chat_messages.append(assistant_message)

                # If no tool calls, we're done
                if not current_tool_calls:
                    yield "full_response", ensure_serializable(new_messages)
                    break

                # Execute tool calls
                # Convert tool calls to proper format and add to message

                formatted_tool_calls = []
                for tc in tool_calls_data:
                    formatted_tc = SimpleNamespace()
                    formatted_tc.id = tc["id"]
                    formatted_tc.function = SimpleNamespace()
                    formatted_tc.function.name = tc["function"]["name"]
                    formatted_tc.function.arguments = tc["function"]["arguments"]
                    formatted_tool_calls.append(formatted_tc)

                # Execute each tool call
                for tool_call in formatted_tool_calls:
                    tool_name = tool_call.function.name
                    tool_call_id = tool_call.id

                    try:
                        # Parse arguments from JSON string
                        args_json = json.loads(tool_call.function.arguments)
                    except json.JSONDecodeError:
                        error_msg = f"\n[Error parsing tool arguments]: Invalid JSON: {tool_call.function.arguments}\n"
                        yield "error", error_msg
                        args_json = {}

                    try:
                        # Check if it's a local tool
                        local_tool_names = [tool["name"] for tool in self.local_tools]
                        if tool_name in local_tool_names:
                            # Call local tool
                            result = await self._call_local_tool(tool_name, args_json)
                            tool_result_content = json.dumps(
                                ensure_serializable(result)
                            )
                        else:
                            raise ValueError(f"Unknown tool: {tool_name}")

                        # Yield tool result
                        yield (
                            "tool_result",
                            f"data: {json.dumps({'tr': {'tool_call_id': tool_call_id, 'content': tool_result_content}})}\n\n",
                        )

                        # Create a tool result message
                        # Ensure content is always a string for the message history
                        if isinstance(tool_result_content, str):
                            content_str = tool_result_content
                        elif isinstance(tool_result_content, (dict, list)):
                            content_str = json.dumps(tool_result_content)
                        else:
                            content_str = str(tool_result_content)

                        tool_message = {
                            "role": "tool",
                            "tool_call_id": tool_call_id,
                            "content": content_str,
                        }

                        # Add to message history
                        new_messages.append(tool_message)
                        chat_messages.append(tool_message)

                    except Exception as e:
                        error_msg = f"\n[Error calling tool {tool_name}]: {type(e).__name__}: {e}\n"
                        print(error_msg, flush=True)
                        yield "error", error_msg

                        # Add error message as tool response
                        error_tool_message = {
                            "role": "tool",
                            "tool_call_id": tool_call_id,
                            "content": f"Error executing tool '{tool_name}': {str(e)}",
                        }
                        new_messages.append(error_tool_message)
                        chat_messages.append(error_tool_message)
                        # Yield error as a tool result for the stream
                        yield (
                            "tool_result",
                            f"data: {json.dumps({'tr': {'tool_call_id': tool_call_id, 'content': error_tool_message['content'], 'error': True}})}\n\n",
                        )

                # Continue the loop to get the next assistant response

            except Exception as e:
                error_msg = f"\n[Error during API call]: {type(e).__name__}: {e}\n"
                print(error_msg, flush=True)
                yield "error", error_msg
                return

        # Return all new messages added during this interaction
        yield "full_response", ensure_serializable(new_messages)

    async def cleanup(self):
        """Clean up resources"""
        pass  # No cleanup needed for simplified client
