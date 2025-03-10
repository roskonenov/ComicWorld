const baseUrl = 'http://localhost:3030/jsonstore/comics-info';

export default{

    async getAllComicInfos() {
        const response = await fetch(baseUrl);
        const comicInfos = await response.json();
        
        return Object.values(comicInfos);
    },
}