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
    const [value, votes] = useGetResources(jsonStoreBaseUrl);
    return [value, votes];
}

export function usePostComicRating(ratingId, value, votes) {

    const [pending, resource] = useCreateResources(
        'PUT',
        `${jsonStoreBaseUrl}/${ratingId}`,
        { value, votes }
    );
    console.log(pending, resource);
    
    return [pending, resource];
}