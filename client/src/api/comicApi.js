import useCreateResources from "../hooks/useCreateResources";
import useGetResources from "../hooks/useGetResources";

const collectionsBaseUrl = 'http://localhost:3030/data/comicsInfo';
const jsonStoreBaseUrl = 'http://localhost:3030/jsonstore/comics-rating';

export function useComics() {
    const [loading, comics] = useGetResources(collectionsBaseUrl);
    return [loading, comics];
}

export function useComic(comicId) {
    const [loading, comic] = useGetResources(`${collectionsBaseUrl}/${comicId}`);
    return [loading, comic];
}

export function useLatestComics(count) {
    const searchParams = new URLSearchParams({
        sortBy: '_createdOn desc',
        pageSize: `${count}`,
    });

    const [loading, comics] = useGetResources(`${collectionsBaseUrl}?${searchParams.toString()}`);
    return [loading, comics];
}

export function useComicRating(ratingId) {
    console.log(ratingId)
    const [_, resource] = useGetResources(`${jsonStoreBaseUrl}/${ratingId}`);
    const ratingData = Object.values(resource);
    
    return {ratingData};
}

export function usePostComicRating() {
    const { fetchResource, resource, loading, error} = useCreateResources();

    async function postRating(ratingId, votes, value) {
        const result = await fetchResource(
            'PUT',
            `${jsonStoreBaseUrl}/${ratingId}`,
            { value, votes }
        );
        
        return result;
    }
    return { postRating, resource, loading, error };
}