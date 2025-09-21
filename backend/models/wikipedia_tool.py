import httpx
from typing import Dict, Any


async def get_page_content(page_title: str) -> str:
    """Get the content of a Wikipedia page"""
    try:
        content_url = "https://en.wikipedia.org/w/api.php"
        content_params = {
            "action": "query",
            "prop": "extracts",
            "explaintext": True,
            "exsectionformat": "plain",
            "titles": page_title,
            "format": "json",
            "exlimit": "max",
        }

        headers = {
            "User-Agent": "WikipediaSearchTool/1.0 (https://example.com/contact)"
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                content_url, params=content_params, headers=headers
            )
            response.raise_for_status()
            data = response.json()

        pages = data.get("query", {}).get("pages", {})
        for page_id, page_data in pages.items():
            if page_id != "-1":  # -1 indicates page not found
                return page_data.get("extract", "No content available")

        return "Page not found or no content available"

    except httpx.RequestError as e:
        error_msg = f"Network error fetching page content for '{page_title}': {str(e)}"
        print(error_msg, flush=True)
        return error_msg
    except Exception as e:
        error_msg = f"Error fetching page content for '{page_title}': {str(e)}"
        print(error_msg, flush=True)
        return error_msg


async def search_wikipedia(query: str, limit: int = 5) -> Dict[str, Any]:
    """Search Wikipedia for the given query and return results"""
    try:
        search_url = "https://en.wikipedia.org/w/api.php"
        search_params = {
            "action": "query",
            "list": "search",
            "srsearch": query,
            "format": "json",
            "srlimit": min(limit, 50),  # Wikipedia API limits to 50 max
        }

        headers = {
            "User-Agent": "WikipediaSearchTool/1.0 (https://example.com/contact)"
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                search_url, params=search_params, headers=headers
            )
            response.raise_for_status()
            search_data = response.json()

        if "query" not in search_data or "search" not in search_data["query"]:
            return {
                "search_query": query,
                "results": [],
                "total_results": 0,
                "error": "No search results found",
            }

        search_results = search_data["query"]["search"]
        results = []

        for result in search_results[:limit]:
            # Get page content for each search result
            page_title = result["title"]
            page_content = await get_page_content(page_title)

            results.append(
                {
                    "title": page_title,
                    "snippet": result.get("snippet", ""),
                    "pageid": result.get("pageid"),
                    "wordcount": result.get("wordcount", 0),
                    "timestamp": result.get("timestamp", ""),
                    "content": page_content,
                }
            )

        if results:
            print(
                f"Wikipedia search successful: {query} -> {len(results)} results",
                flush=True,
            )

        return {
            "search_query": query,
            "results": results,
            "total_results": len(results),
            "success": True,
        }

    except httpx.RequestError as e:
        error_msg = f"Network error searching Wikipedia: {str(e)}"
        print(error_msg, flush=True)
        return {
            "search_query": query,
            "results": [],
            "total_results": 0,
            "error": error_msg,
            "success": False,
        }
    except Exception as e:
        error_msg = f"Error searching Wikipedia: {str(e)}"
        print(error_msg, flush=True)
        return {
            "search_query": query,
            "results": [],
            "total_results": 0,
            "error": error_msg,
            "success": False,
        }


def get_wikipedia_tool_definition() -> Dict[str, Any]:
    """Get the tool definition for function calling."""
    return {
        "name": "wikipedia_search",
        "description": "Search Wikipedia for information about a topic or query.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query or topic to search for on Wikipedia",
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of search results to return (default: 5)",
                    "default": 5,
                },
            },
            "required": ["query"],
        },
    }
