import useGetResources from "../hooks/useGetResources";

const baseUrl = 'http://localhost:3030/data/comicsInfo';

export function useComics() {
    const [loading, comics] = useGetResources(baseUrl);

    return [loading, comics];
}

export function useComic(comicId) {
    const [loading, comic] = useGetResources(`${baseUrl}/${comicId}`);

    return [loading, comic];
}

export function useLatestComics(count) {
    const searchParams = new URLSearchParams({
        sortBy: '_createdOn desc',
        pageSize: `${count}`,
    });

    const [loading, comics] = useGetResources(`${baseUrl}?${searchParams.toString()}`);

    return [loading, comics];
}